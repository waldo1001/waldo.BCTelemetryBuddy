/**
 * Agent Context Manager — manages reading/writing agent files on disk.
 *
 * Follows the same patterns as existing QueriesService and CacheService:
 * - Filesystem-based storage in the workspace directory
 * - JSON serialization for structured data
 * - Directory auto-creation
 *
 * Design: SRP — this module handles ONLY file I/O for agents.
 * State mutation logic is separate (updateState method builds the new state object).
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    AgentState,
    AgentIssue,
    AgentRunLog,
    AgentRunSummary,
    AgentAction,
    AgentOutput,
    AgentInfo
} from './types.js';
import { generateRunReport, createInvestigationReport } from './report.js';

/** Default number of resolved issue days to keep */
const DEFAULT_RESOLVED_ISSUE_TTL_DAYS = 30;

export class AgentContextManager {
    private readonly workspacePath: string;
    private readonly agentsDir: string;
    private readonly contextWindowSize: number;
    private readonly resolvedIssueTTLDays: number;

    constructor(
        workspacePath: string,
        contextWindowSize: number = 5,
        resolvedIssueTTLDays: number = DEFAULT_RESOLVED_ISSUE_TTL_DAYS
    ) {
        this.workspacePath = workspacePath;
        this.agentsDir = path.join(workspacePath, 'agents');
        this.contextWindowSize = contextWindowSize;
        this.resolvedIssueTTLDays = resolvedIssueTTLDays;
    }

    // ─── Read Operations ─────────────────────────────────────────────────────

    /**
     * Load the agent's instruction.md file.
     * Throws if instruction file does not exist.
     */
    loadInstruction(agentName: string): string {
        const filePath = path.join(this.agentsDir, agentName, 'instruction.md');
        if (!fs.existsSync(filePath)) {
            throw new Error(`Agent '${agentName}' has no instruction.md at ${filePath}`);
        }
        return fs.readFileSync(filePath, 'utf-8');
    }

    /**
     * Load the agent's state.json.
     * Returns initial state if file does not exist.
     */
    loadState(agentName: string): AgentState {
        const filePath = path.join(this.agentsDir, agentName, 'state.json');
        if (!fs.existsSync(filePath)) {
            return this.createInitialState(agentName);
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }

    /**
     * Check if an agent exists (has an instruction.md).
     */
    agentExists(agentName: string): boolean {
        const filePath = path.join(this.agentsDir, agentName, 'instruction.md');
        return fs.existsSync(filePath);
    }

    /**
     * List all agents — scans agents/ directory for subdirectories with instruction.md.
     */
    listAgents(): AgentInfo[] {
        if (!fs.existsSync(this.agentsDir)) {
            return [];
        }

        const entries = fs.readdirSync(this.agentsDir, { withFileTypes: true });
        const agents: AgentInfo[] = [];

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const instructionPath = path.join(this.agentsDir, entry.name, 'instruction.md');
            if (!fs.existsSync(instructionPath)) continue;

            const state = this.loadState(entry.name);
            agents.push({
                name: entry.name,
                status: state.status,
                runCount: state.runCount,
                lastRun: state.lastRun,
                activeIssueCount: state.activeIssues.length
            });
        }

        return agents;
    }

    /**
     * Get run history for an agent.
     * Reads runs/ directory, parses JSON files, returns sorted by timestamp (newest first).
     */
    getRunHistory(agentName: string, limit?: number): AgentRunLog[] {
        const runsDir = path.join(this.agentsDir, agentName, 'runs');
        if (!fs.existsSync(runsDir)) {
            return [];
        }

        const files = fs.readdirSync(runsDir)
            .filter(f => f.endsWith('.json'))
            .sort()
            .reverse();

        const filesToRead = limit ? files.slice(0, limit) : files;

        return filesToRead.map(file => {
            const content = fs.readFileSync(path.join(runsDir, file), 'utf-8');
            return JSON.parse(content) as AgentRunLog;
        });
    }

    // ─── Write Operations ────────────────────────────────────────────────────

    /**
     * Create a new agent — sets up directory structure and initial files.
     */
    createAgent(agentName: string, instruction: string): void {
        const agentDir = path.join(this.agentsDir, agentName);

        if (fs.existsSync(path.join(agentDir, 'instruction.md'))) {
            throw new Error(`Agent '${agentName}' already exists`);
        }

        fs.mkdirSync(agentDir, { recursive: true });
        fs.mkdirSync(path.join(agentDir, 'runs'), { recursive: true });
        fs.writeFileSync(
            path.join(agentDir, 'instruction.md'),
            instruction,
            'utf-8'
        );
        fs.writeFileSync(
            path.join(agentDir, 'state.json'),
            JSON.stringify(this.createInitialState(agentName), null, 2),
            'utf-8'
        );
    }

    /**
     * Save agent state to disk.
     */
    saveState(agentName: string, state: AgentState): void {
        const filePath = path.join(this.agentsDir, agentName, 'state.json');
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
    }

    /**
     * Save a run log file. Run files are append-only audit trails.
     * Also creates a per-run investigation doc in docs/.
     */
    saveRunLog(agentName: string, runLog: AgentRunLog, investigationReport?: string): void {
        const runsDir = path.join(this.agentsDir, agentName, 'runs');
        fs.mkdirSync(runsDir, { recursive: true });

        // Format: YYYY-MM-DDTHH-MMZ-runNNN.json (UTC, hyphens for filesystem compat)
        const timestamp = runLog.timestamp
            .replace(/:/g, '-')
            .replace(/\.\d+Z$/, 'Z');
        const runIdStr = String(runLog.runId).padStart(4, '0');
        const filePath = path.join(runsDir, `${timestamp}-run${runIdStr}.json`);
        fs.writeFileSync(filePath, JSON.stringify(runLog, null, 2), 'utf-8');

        // Also write a human-readable Markdown report alongside the JSON
        const reportPath = path.join(runsDir, `${timestamp}-run${runIdStr}.md`);
        fs.writeFileSync(reportPath, generateRunReport(runLog), 'utf-8');

        // Create per-run investigation doc
        if (investigationReport) {
            const investigationDocPath = createInvestigationReport(
                this.workspacePath,
                agentName,
                runLog,
                investigationReport
            );
            runLog.investigationReportPath = investigationDocPath;
            // Re-write JSON with the path included
            fs.writeFileSync(filePath, JSON.stringify(runLog, null, 2), 'utf-8');
        }
    }

    /**
     * Set agent status (active/paused).
     */
    setAgentStatus(agentName: string, status: 'active' | 'paused'): void {
        const state = this.loadState(agentName);
        state.status = status;
        this.saveState(agentName, state);
    }

    // ─── State Update Logic ──────────────────────────────────────────────────

    /**
     * Build an updated AgentState from agent output + metadata.
     * Does NOT write to disk — caller is responsible for saving.
     *
     * This method:
     * 1. Updates summary from LLM output
     * 2. Updates active/resolved issues
     * 3. Builds AgentRunSummary and adds to sliding window
     * 4. Prunes resolved issues past TTL
     * 5. Sets run field on executed actions
     */
    updateState(
        agentName: string,
        previousState: AgentState,
        output: AgentOutput,
        executedActions: AgentAction[],
        runDurationMs: number,
        toolCallNames: string[]
    ): AgentState {
        const newRunId = previousState.runCount + 1;
        const now = new Date().toISOString();

        // Set run number on executed actions
        const actionsWithRun = executedActions.map(a => ({ ...a, run: newRunId }));

        // Build the new issues list from LLM output
        const newActiveIssues: AgentIssue[] = output.activeIssues.map(oi => {
            const existing = previousState.activeIssues.find(
                ai => ai.id === oi.id || ai.fingerprint === oi.fingerprint
            );
            return {
                id: oi.id,
                fingerprint: oi.fingerprint,
                title: oi.title,
                firstSeen: existing?.firstSeen || now,
                lastSeen: oi.lastSeen || now,
                consecutiveDetections: oi.consecutiveDetections,
                trend: oi.trend,
                counts: oi.counts,
                actionsTaken: [
                    ...(existing?.actionsTaken || []),
                    ...actionsWithRun
                ]
            };
        });

        // Move newly resolved issues
        const newResolvedIssues = [
            ...previousState.resolvedIssues,
            ...previousState.activeIssues.filter(
                ai => output.resolvedIssues.includes(ai.id)
            )
        ];

        // Prune resolved issues older than TTL
        const ttlCutoff = new Date();
        ttlCutoff.setDate(ttlCutoff.getDate() - this.resolvedIssueTTLDays);
        const prunedResolved = newResolvedIssues.filter(
            issue => new Date(issue.lastSeen) > ttlCutoff
        );

        // Build run summary for sliding window
        const runSummary: AgentRunSummary = {
            runId: newRunId,
            timestamp: now,
            durationMs: runDurationMs,
            toolCalls: toolCallNames,
            findings: output.findings,
            actions: actionsWithRun
        };

        // Sliding window: keep last N runs
        const recentRuns = [
            ...previousState.recentRuns,
            runSummary
        ].slice(-this.contextWindowSize);

        return {
            agentName,
            created: previousState.created,
            lastRun: now,
            runCount: newRunId,
            status: previousState.status,
            summary: output.summary,
            activeIssues: newActiveIssues,
            resolvedIssues: prunedResolved,
            recentRuns
        };
    }

    // ─── Private Helpers ─────────────────────────────────────────────────────

    /**
     * Create a fresh initial state for a new agent.
     */
    createInitialState(agentName: string): AgentState {
        return {
            agentName,
            created: new Date().toISOString(),
            lastRun: '',
            runCount: 0,
            status: 'active',
            summary: '',
            activeIssues: [],
            resolvedIssues: [],
            recentRuns: []
        };
    }

    /**
     * Get the agents directory path (for testing).
     */
    getAgentsDir(): string {
        return this.agentsDir;
    }
}
