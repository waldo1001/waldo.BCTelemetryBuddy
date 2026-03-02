/**
 * Type definitions for the Agentic Autonomous Telemetry Monitoring feature.
 *
 * All interfaces shared across agent modules (runtime, context, actions, prompts, CLI)
 * live here to avoid circular dependencies and ensure a single source of truth.
 */

// ─── Action Types ────────────────────────────────────────────────────────────

export type ActionType =
    | 'teams-webhook'
    | 'email-smtp'
    | 'email-graph'
    | 'generic-webhook'
    | 'pipeline-trigger';

// ─── Agent State (persisted to state.json) ───────────────────────────────────

export interface AgentState {
    agentName: string;
    created: string;                // ISO 8601
    lastRun: string;                // ISO 8601
    runCount: number;
    status: 'active' | 'paused';

    /** LLM-written digest of all previous runs */
    summary: string;

    activeIssues: AgentIssue[];
    resolvedIssues: AgentIssue[];   // pruned after 30 days

    /** Sliding window of last N runs */
    recentRuns: AgentRunSummary[];
}

export interface AgentIssue {
    id: string;
    fingerprint: string;            // deterministic dedup key
    title: string;
    firstSeen: string;              // ISO 8601
    lastSeen: string;               // ISO 8601
    consecutiveDetections: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    counts: number[];
    actionsTaken: AgentAction[];
}

export interface AgentRunSummary {
    runId: number;
    timestamp: string;              // ISO 8601
    durationMs: number;
    toolCalls: string[];            // tool names called
    findings: string;               // LLM-written summary of this run
    actions: AgentAction[];
}

// ─── Agent Actions ───────────────────────────────────────────────────────────

export interface AgentAction {
    run: number;
    type: ActionType;
    timestamp: string;
    status: 'sent' | 'failed';
    details?: Record<string, any>;
}

/**
 * What the LLM outputs in its JSON response (see Output Format in prompts).
 * The runtime converts RequestedAction → AgentAction by adding run, timestamp, status.
 */
export interface RequestedAction {
    type: ActionType;
    title: string;
    message: string;
    severity: 'high' | 'medium' | 'low';
    recipients?: string[];
    webhookPayload?: Record<string, any>;
    investigationId?: string;
}

// ─── Agent Run Log (audit trail) ─────────────────────────────────────────────

export interface ToolCallEntry {
    sequence: number;
    tool: string;
    args: Record<string, any>;
    resultSummary: string;
    durationMs: number;
}

export interface AgentRunLog {
    runId: number;
    agentName: string;
    timestamp: string;
    durationMs: number;

    instruction: string;
    stateAtStart: {
        summary: string;
        activeIssueCount: number;
        runCount: number;
    };

    llm: {
        model: string;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        toolCallCount: number;
    };

    toolCalls: ToolCallEntry[];

    assessment: string;
    findings: string;
    actions: AgentAction[];

    /** LLM-written markdown investigation report for daily docs */
    investigationReport?: string;

    /** Relative path to the daily investigation doc (set by saveRunLog) */
    investigationReportPath?: string;

    stateChanges: {
        issuesCreated: string[];
        issuesUpdated: string[];
        issuesResolved: string[];
        summaryUpdated: boolean;
    };
}

// ─── Agent Output (LLM response shape) ──────────────────────────────────────

export interface AgentOutput {
    summary: string;
    findings: string;
    assessment: string;
    /** LLM-written markdown investigation report for daily docs */
    investigationReport: string;
    activeIssues: {
        id: string;
        fingerprint: string;
        title: string;
        consecutiveDetections: number;
        trend: 'increasing' | 'stable' | 'decreasing';
        counts: number[];
        lastSeen: string;
    }[];
    resolvedIssues: string[];
    actions: RequestedAction[];
    stateChanges: {
        issuesCreated: string[];
        issuesUpdated: string[];
        issuesResolved: string[];
        summaryUpdated: boolean;
    };
}

// ─── Agent Info (for listing) ────────────────────────────────────────────────

export interface AgentInfo {
    name: string;
    status: 'active' | 'paused';
    runCount: number;
    lastRun: string;
    activeIssueCount: number;
}

// ─── LLM Provider Interface ─────────────────────────────────────────────────

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface ChatOptions {
    tools?: OpenAIToolDef[];
    maxTokens?: number;
}

export interface OpenAIToolDef {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, any>;
    };
}

export interface ChatResponse {
    content: string;
    toolCalls?: ToolCall[];
    assistantMessage: ChatMessage;
    usage: {
        promptTokens: number;
        completionTokens: number;
    };
    /** Why the LLM stopped generating. 'stop' = normal, 'length' = truncated at max_tokens */
    finishReason?: 'stop' | 'tool_calls' | 'length' | string;
}

/**
 * LLM Provider abstraction — decouples runtime from any specific LLM SDK.
 * Supported implementations: Azure OpenAI, Anthropic/Claude.
 */
export interface LLMProvider {
    /** The model/deployment name, used for logging. */
    modelName: string;
    chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse>;
}

// ─── Agent Runtime Config ────────────────────────────────────────────────────

export interface AgentRuntimeConfig {
    llmProvider: LLMProvider;
    maxToolCalls: number;           // default: 20
    maxTokens: number;              // default: 32768
    contextWindowRuns: number;      // default: 5
    toolScope: 'read-only' | 'full';
    retry: RetryConfig;             // LLM call retry settings
}

/**
 * Retry configuration for LLM API calls.
 * Uses exponential backoff: delay = initialDelayMs * (backoffMultiplier ^ attempt)
 */
export interface RetryConfig {
    maxRetries: number;             // default: 3
    initialDelayMs: number;         // default: 2000 (2s)
    backoffMultiplier: number;      // default: 2
    maxDelayMs: number;             // default: 60000 (60s)
    retryableStatusCodes: number[]; // default: [429, 529, 503]
}

// ─── Agent Config Section (from .bctb-config.json) ──────────────────────────

export interface AgentConfigSection {
    llm: {
        /** 'azure-openai' | 'anthropic' */
        provider: string;
        /** Azure OpenAI endpoint URL (azure-openai only) */
        endpoint?: string;
        /** Model/deployment name — Azure deployment name or Anthropic model (e.g. 'claude-opus-4-5') */
        deployment?: string;
        /** Alias for deployment, preferred for Anthropic configs */
        model?: string;
        /** Azure OpenAI API version (azure-openai only) */
        apiVersion?: string;
    };
    defaults?: {
        maxToolCalls?: number;
        maxTokens?: number;
        contextWindowRuns?: number;
        resolvedIssueTTLDays?: number;
        toolScope?: 'read-only' | 'full';
        retry?: {
            maxRetries?: number;
            initialDelayMs?: number;
            backoffMultiplier?: number;
            maxDelayMs?: number;
        };
    };
    actions?: ActionConfig;
}

// ─── Action Config ───────────────────────────────────────────────────────────

export interface ActionConfig {
    'teams-webhook'?: {
        url: string;
    };
    'email-smtp'?: {
        host: string;
        port: number;
        secure: boolean;
        auth: {
            user: string;
            pass?: string;
        };
        from: string;
        defaultTo: string[];
    };
    'email-graph'?: {
        tenantId: string;
        clientId: string;
        from: string;
        defaultTo: string[];
    };
    'generic-webhook'?: {
        url: string;
        method?: string;
        headers?: Record<string, string>;
    };
    'pipeline-trigger'?: {
        orgUrl: string;
        project: string;
        pipelineId: number;
        pat?: string;
    };
}
