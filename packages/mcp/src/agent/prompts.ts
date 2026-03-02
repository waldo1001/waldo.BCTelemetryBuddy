/**
 * Agent Prompts — system prompt, prompt builder, and output parser.
 *
 * Design:
 * - AGENT_SYSTEM_PROMPT is the fixed system message for all agents
 * - buildAgentPrompt() constructs the user message with instruction + state
 * - parseAgentOutput() extracts structured JSON from LLM response
 * - filterToolsByScope() controls which tools the agent can access
 * - toolDefinitionsToOpenAI() converts MCP tool defs to OpenAI format
 */

import { AgentState, AgentOutput, OpenAIToolDef } from './types.js';
import { ToolDefinition } from '../tools/toolDefinitions.js';

/**
 * System prompt — defines the agent's overall behavior.
 * Sent to the LLM as the system message on every run.
 */
export const AGENT_SYSTEM_PROMPT = `You are a telemetry monitoring agent for Microsoft Dynamics 365 Business Central.
You run on a schedule and monitor telemetry data using the tools provided.

## Your Behavior

1. READ your instruction carefully — it defines what you monitor and how you respond.
2. READ your previous state — it tells you what you found before and what issues are active.
3. USE TOOLS to gather current telemetry data:
   - Always start with get_event_catalog if this is your first run or if you need to discover events.
   - Use get_event_field_samples before writing queries for unfamiliar events.
   - Use get_tenant_mapping if your instruction involves specific customers.
   - Use query_telemetry to execute KQL queries.
4. ASSESS findings by comparing with previous state:
   - Is this a new issue or a continuation of an existing one?
   - Is the situation improving, stable, or worsening?
   - Does this require escalation per your instruction?
5. DECIDE on actions based on your instruction:
   - Only take actions explicitly described in your instruction.
   - Track consecutive detections accurately.
6. REPORT your findings, assessment, and actions in the structured output format.

## Output Format

You MUST respond with a JSON object matching this structure:

\`\`\`json
{
  "summary": "Updated rolling summary incorporating this run's findings",
  "findings": "What you found this run (human-readable)",
  "assessment": "Your interpretation and reasoning",
  "activeIssues": [
    {
      "id": "issue-XXX",
      "fingerprint": "deterministic-key",
      "title": "Short description",
      "consecutiveDetections": 3,
      "trend": "increasing",
      "counts": [47, 52, 61],
      "lastSeen": "2026-02-24T12:00:00Z"
    }
  ],
  "resolvedIssues": ["issue-YYY"],
  "actions": [
    {
      "type": "teams-webhook",
      "title": "Alert title",
      "message": "Alert body",
      "severity": "high"
    }
  ],
  "stateChanges": {
    "issuesCreated": ["issue-XXX"],
    "issuesUpdated": ["issue-ZZZ"],
    "issuesResolved": ["issue-YYY"],
    "summaryUpdated": true
  }
}
\`\`\`

## Available Action Types

| Type | Purpose | Extra fields |
|------|---------|-------------|
| teams-webhook | Post an Adaptive Card to a Microsoft Teams channel. | — |
| email-smtp | Send an email via SMTP relay. | recipients (optional) |
| email-graph | Send an email via Microsoft Graph API. | recipients (optional) |
| generic-webhook | POST to any HTTP endpoint (Slack, PagerDuty, custom API). | webhookPayload (optional) |
| pipeline-trigger | Trigger an Azure DevOps pipeline. | — |

## Rules

- Do NOT invent data. Only report what you find in real telemetry.
- Do NOT take actions that are not described in your instruction.
- Do NOT re-alert for issues that have already been escalated (check actionsTaken in state).
- Keep summaries concise — each run's findings should be 1-3 sentences.
- Use deterministic fingerprints so the same issue is tracked consistently across runs.

## Re-alerting & Cooldown

1. Before taking ANY action, check the actionsTaken array in state for prior alerts.
2. Default cooldown: 24 hours. Do NOT send another alert for the same issue within 24 hours unless severity escalated or trend significantly worsened.
3. Resolved-then-recurred issues are new. Alerting restarts.
4. When in doubt, do NOT alert.
5. Log your reasoning in the assessment field.`;

/**
 * Build the user prompt from the agent's instruction and previous state.
 */
export function buildAgentPrompt(instruction: string, state: AgentState): string {
    const now = new Date().toISOString();
    const runNumber = state.runCount + 1;

    let prompt = `## Your Instruction\n\n${instruction}\n\n`;
    prompt += `## Current Time\n\n${now} (Run #${runNumber})\n\n`;

    if (state.runCount === 0) {
        prompt += `## Previous State\n\nThis is your FIRST RUN. No previous context.\n\n`;
    } else {
        prompt += `## Previous State\n\n`;
        prompt += `### Summary\n${state.summary}\n\n`;

        if (state.activeIssues.length > 0) {
            prompt += `### Active Issues (${state.activeIssues.length})\n`;
            prompt += '```json\n' + JSON.stringify(state.activeIssues, null, 2) + '\n```\n\n';
        }

        if (state.recentRuns.length > 0) {
            prompt += `### Recent Runs (last ${state.recentRuns.length})\n`;
            for (const run of state.recentRuns) {
                prompt += `- **Run ${run.runId}** (${run.timestamp}): ${run.findings}\n`;
                if (run.actions.length > 0) {
                    prompt += `  Actions: ${run.actions.map(a => a.type).join(', ')}\n`;
                }
            }
            prompt += '\n';
        }
    }

    prompt += `## Task\n\nExecute your instruction now. Use tools to gather data, assess the situation, and take any actions required by your instruction.\n`;

    return prompt;
}

/**
 * Parse structured JSON output from the LLM's final response.
 * Handles both raw JSON and JSON wrapped in markdown code fences.
 * Includes repair logic for common LLM JSON generation mistakes.
 */
export function parseAgentOutput(content: string): AgentOutput {
    if (!content || content.trim() === '') {
        throw new Error('Agent produced empty response');
    }

    // Try to extract JSON from markdown code fences first
    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const rawMatch = content.match(/\{[\s\S]*\}/);

    // Also try matching a JSON object that may be truncated (starts with { but no closing })
    const truncatedMatch = !rawMatch ? content.match(/(\{[\s\S]*)$/) : null;

    const jsonStr = fenceMatch?.[1] || rawMatch?.[0] || truncatedMatch?.[1];

    if (!jsonStr) {
        throw new Error('Agent did not produce valid JSON output');
    }

    try {
        // First try strict parse
        const parsed = tryParseJSON(jsonStr);
        return validateAgentOutput(parsed);
    } catch (error: any) {
        if (error.message.includes('Missing required field')) {
            throw error;
        }
        throw new Error(`Failed to parse agent JSON output: ${error.message}`);
    }
}

/**
 * Try to parse JSON, with repair attempts for common LLM mistakes.
 * Attempts in order:
 *   1. Strict JSON.parse
 *   2. Repair trailing commas, unescaped newlines, etc.
 *   3. Truncation recovery (close open brackets/braces)
 */
function tryParseJSON(jsonStr: string): any {
    // 1. Try strict parse
    try {
        return JSON.parse(jsonStr);
    } catch { /* continue to repair */ }

    // 2. Try repairing common LLM JSON mistakes
    let repaired = jsonStr;

    // Remove trailing commas before } or ]
    repaired = repaired.replace(/,\s*([\]}])/g, '$1');

    // Escape unescaped newlines inside string values
    // Match strings and replace raw newlines within them
    repaired = repaired.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
        return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    });

    try {
        const result = JSON.parse(repaired);
        console.log('  ⚠ Repaired malformed JSON from LLM (trailing commas / unescaped chars)');
        return result;
    } catch { /* continue to truncation recovery */ }

    // 3. Truncation recovery — close open brackets/braces
    const truncated = closeTruncatedJSON(repaired);
    try {
        const result = JSON.parse(truncated);
        console.log('  ⚠ Recovered truncated JSON from LLM (closed open brackets)');
        return result;
    } catch (finalError: any) {
        throw finalError;
    }
}

/**
 * Attempt to close truncated JSON by balancing brackets and braces.
 * Handles cases where the LLM's output was cut off mid-response.
 */
function closeTruncatedJSON(json: string): string {
    // Track bracket/brace nesting, respecting strings
    let inString = false;
    let escaped = false;
    const stack: string[] = [];

    for (const ch of json) {
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === '\\' && inString) {
            escaped = true;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;

        if (ch === '{') stack.push('}');
        else if (ch === '[') stack.push(']');
        else if (ch === '}' || ch === ']') {
            if (stack.length > 0 && stack[stack.length - 1] === ch) {
                stack.pop();
            }
        }
    }

    // If we're inside a string, close it first
    if (inString) {
        json += '"';
    }

    // Remove any trailing incomplete key-value (e.g., `"key": ` or `"key": "val`)
    // by trimming back to the last complete value
    json = json.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '');

    // Close remaining open brackets
    while (stack.length > 0) {
        json += stack.pop();
    }

    return json;
}

/**
 * Validate that parsed JSON has required AgentOutput fields.
 */
function validateAgentOutput(parsed: any): AgentOutput {
    // Validate required fields
    if (typeof parsed.summary !== 'string') {
        throw new Error('Missing required field: summary');
    }
    if (typeof parsed.findings !== 'string') {
        throw new Error('Missing required field: findings');
    }
    if (typeof parsed.assessment !== 'string') {
        throw new Error('Missing required field: assessment');
    }

    // Provide defaults for optional arrays
    return {
        summary: parsed.summary,
        findings: parsed.findings,
        assessment: parsed.assessment,
        activeIssues: parsed.activeIssues || [],
        resolvedIssues: parsed.resolvedIssues || [],
        actions: parsed.actions || [],
        stateChanges: parsed.stateChanges || {
            issuesCreated: [],
            issuesUpdated: [],
            issuesResolved: [],
            summaryUpdated: true
        }
    };
}

/**
 * Tools that are excluded in read-only mode.
 * Write operations that could modify state unexpectedly.
 */
const WRITE_TOOLS = ['save_query', 'switch_profile'];

/**
 * Filter tool definitions by scope.
 * 'read-only' excludes write tools (save_query, switch_profile).
 * 'full' includes all tools.
 */
export function filterToolsByScope(
    tools: ToolDefinition[],
    scope: 'read-only' | 'full'
): ToolDefinition[] {
    if (scope === 'full') return tools;
    return tools.filter(t => !WRITE_TOOLS.includes(t.name));
}

/**
 * Convert MCP tool definitions to OpenAI function-calling format.
 */
export function toolDefinitionsToOpenAI(tools: ToolDefinition[]): OpenAIToolDef[] {
    return tools.map(t => ({
        type: 'function' as const,
        function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema
        }
    }));
}
