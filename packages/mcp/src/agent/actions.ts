/**
 * Action Dispatcher — executes external actions requested by the agent.
 *
 * Each action type is a simple HTTP call (Teams webhook, email, pipeline trigger, etc.).
 * The dispatcher receives RequestedActions from the agent output and converts them
 * to AgentActions with status (sent/failed) and timestamp.
 *
 * Design:
 * - SRP: handles only action execution, not state management
 * - OCP: new action types = new private method, no changes to dispatch()
 * - DIP: uses fetch() for HTTP, injectable for testing
 */

import {
    ActionConfig,
    ActionType,
    AgentAction,
    RequestedAction
} from './types.js';

/**
 * Parse a markdown message into Adaptive Card body elements.
 * Converts markdown tables → Adaptive Card Table elements (schema 1.5).
 * Regular text → TextBlock elements with markdown support.
 */
export function parseMarkdownToAdaptiveCardBody(message: string): any[] {
    const body: any[] = [];

    // Split message into table and non-table segments
    // Markdown table lines start with | and contain at least one |
    const lines = message.split('\n');
    let currentText: string[] = [];
    let currentTable: string[] = [];
    let inTable = false;

    const flushText = () => {
        const text = currentText.join('\n').trim();
        if (text) {
            body.push({ type: 'TextBlock', text, wrap: true });
        }
        currentText = [];
    };

    const flushTable = () => {
        if (currentTable.length < 2) {
            // Not a real table (need header + separator at minimum)
            currentText.push(...currentTable);
            currentTable = [];
            return;
        }

        const tableRows = currentTable
            .filter(line => !line.match(/^\s*\|[-:| ]+\|\s*$/)); // Remove separator rows

        if (tableRows.length === 0) {
            currentTable = [];
            return;
        }

        const parseCells = (row: string) =>
            row.split('|').map(c => c.trim()).filter((_, i, arr) =>
                i > 0 && i < arr.length - 1  // Remove empty first/last from leading/trailing |
            );

        const headerCells = parseCells(tableRows[0]);
        const colCount = headerCells.length;

        const columns = headerCells.map(() => ({ width: 1 }));

        const rows: any[] = [];

        // Header row
        rows.push({
            type: 'TableRow',
            style: 'accent',
            cells: headerCells.map(cell => ({
                type: 'TableCell',
                items: [{ type: 'TextBlock', text: cell, weight: 'Bolder', wrap: true }]
            }))
        });

        // Data rows
        for (let i = 1; i < tableRows.length; i++) {
            const cells = parseCells(tableRows[i]);
            rows.push({
                type: 'TableRow',
                cells: Array.from({ length: colCount }, (_, j) => ({
                    type: 'TableCell',
                    items: [{ type: 'TextBlock', text: cells[j] || '', wrap: true }]
                }))
            });
        }

        body.push({
            type: 'Table',
            gridStyle: 'accent',
            firstRowAsHeader: true,
            showGridLines: true,
            columns,
            rows
        });

        currentTable = [];
    };

    for (const line of lines) {
        const isTableLine = line.trimStart().startsWith('|') && line.trimEnd().endsWith('|');

        if (isTableLine) {
            if (!inTable) {
                flushText();
                inTable = true;
            }
            currentTable.push(line);
        } else {
            if (inTable) {
                flushTable();
                inTable = false;
            }
            currentText.push(line);
        }
    }

    // Flush remaining
    if (inTable) {
        flushTable();
    }
    flushText();

    return body;
}

export class ActionDispatcher {
    private readonly config: ActionConfig;

    constructor(config: ActionConfig) {
        this.config = config;
    }

    /**
     * Dispatch requested actions.
     * Returns AgentAction[] WITHOUT the `run` field set — that's done by updateState().
     */
    async dispatch(
        requestedActions: RequestedAction[],
        agentName: string
    ): Promise<AgentAction[]> {
        const executed: AgentAction[] = [];

        for (const action of requestedActions) {
            try {
                await this.executeAction(action, agentName);
                executed.push({
                    run: 0,     // set by updateState()
                    type: action.type,
                    status: 'sent',
                    timestamp: new Date().toISOString(),
                    details: { title: action.title, severity: action.severity }
                });
            } catch (error: any) {
                executed.push({
                    run: 0,
                    type: action.type,
                    status: 'failed',
                    timestamp: new Date().toISOString(),
                    details: {
                        title: action.title,
                        severity: action.severity,
                        error: error.message
                    }
                });
            }
        }

        return executed;
    }

    /**
     * Check if an action type is configured.
     */
    isConfigured(actionType: ActionType): boolean {
        return this.config[actionType] !== undefined;
    }

    // ─── Private Action Implementations ──────────────────────────────────────

    private async executeAction(action: RequestedAction, agentName: string): Promise<void> {
        switch (action.type) {
            case 'teams-webhook':
                await this.sendTeamsNotification(action, agentName);
                break;
            case 'email-smtp':
                await this.sendEmailSmtp(action);
                break;
            case 'email-graph':
                await this.sendEmailGraph(action);
                break;
            case 'generic-webhook':
                await this.sendGenericWebhook(action, agentName);
                break;
            case 'pipeline-trigger':
                await this.triggerPipeline(action, agentName);
                break;
            default:
                throw new Error(`Unknown action type: ${(action as any).type}`);
        }
    }

    private async sendTeamsNotification(action: RequestedAction, agentName: string): Promise<void> {
        const url = this.config['teams-webhook']?.url;
        if (!url) throw new Error('Teams webhook URL not configured');

        const severityColor = action.severity === 'high' ? 'attention'
            : action.severity === 'medium' ? 'warning' : 'good';

        // Convert message markdown (including tables) to Adaptive Card elements
        const messageBody = parseMarkdownToAdaptiveCardBody(action.message);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'message',
                attachments: [{
                    contentType: 'application/vnd.microsoft.card.adaptive',
                    content: {
                        '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
                        type: 'AdaptiveCard',
                        version: '1.5',
                        body: [
                            { type: 'TextBlock', text: action.title, weight: 'Bolder', size: 'Medium', color: severityColor },
                            ...messageBody,
                            {
                                type: 'FactSet', facts: [
                                    { title: 'Severity', value: action.severity },
                                    { title: 'Agent', value: agentName }
                                ]
                            }
                        ]
                    }
                }]
            })
        });

        if (!response.ok) {
            throw new Error(`Teams webhook failed: ${response.status} ${response.statusText}`);
        }
    }

    private async sendEmailSmtp(action: RequestedAction): Promise<void> {
        const config = this.config['email-smtp'];
        if (!config) throw new Error('SMTP email config not set');

        // Dynamic import — nodemailer is optional (not a core dependency)
        let nodemailer: any;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            nodemailer = require('nodemailer');
        } catch {
            throw new Error('nodemailer is not installed. Run: npm install nodemailer');
        }

        const pass = process.env.SMTP_PASSWORD || config.auth?.pass;
        if (!pass) throw new Error('SMTP_PASSWORD env var not set and no password in config');

        const transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: { user: config.auth.user, pass }
        });

        const recipients = action.recipients?.length ? action.recipients : config.defaultTo;
        if (!recipients?.length) throw new Error('No email recipients specified');

        const severityBadge = action.severity === 'high' ? '🔴'
            : action.severity === 'medium' ? '🟡' : '🟢';

        await transporter.sendMail({
            from: config.from,
            to: recipients.join(', '),
            subject: `${severityBadge} BCTB Agent: ${action.title}`,
            html: [
                `<h2>${severityBadge} ${action.title}</h2>`,
                `<p>${action.message}</p>`,
                `<p><strong>Severity:</strong> ${action.severity}</p>`,
                `<hr><p><em>Sent by BC Telemetry Buddy agent</em></p>`
            ].join('\n')
        });
    }

    private async sendEmailGraph(action: RequestedAction): Promise<void> {
        const config = this.config['email-graph'];
        if (!config) throw new Error('Graph email config not set');

        const clientSecret = process.env.GRAPH_CLIENT_SECRET;
        if (!clientSecret) throw new Error('GRAPH_CLIENT_SECRET env var not set');

        // 1. Acquire token via client_credentials grant
        const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: config.clientId,
                client_secret: clientSecret,
                scope: 'https://graph.microsoft.com/.default',
                grant_type: 'client_credentials'
            })
        });

        if (!tokenResponse.ok) {
            throw new Error(`Token acquisition failed: ${tokenResponse.status}`);
        }

        const tokenData = await tokenResponse.json() as { access_token: string };

        // 2. Send mail via Graph API
        const recipients = action.recipients?.length ? action.recipients : config.defaultTo;
        if (!recipients?.length) throw new Error('No email recipients specified');

        const severityBadge = action.severity === 'high' ? '🔴'
            : action.severity === 'medium' ? '🟡' : '🟢';

        const mailResponse = await fetch(
            `https://graph.microsoft.com/v1.0/users/${config.from}/sendMail`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: {
                        subject: `${severityBadge} BCTB Agent: ${action.title}`,
                        body: {
                            contentType: 'HTML',
                            content: `<h2>${severityBadge} ${action.title}</h2><p>${action.message}</p><p><strong>Severity:</strong> ${action.severity}</p>`
                        },
                        toRecipients: recipients.map(r => ({
                            emailAddress: { address: r }
                        }))
                    }
                })
            }
        );

        if (!mailResponse.ok) {
            throw new Error(`Graph sendMail failed: ${mailResponse.status}`);
        }
    }

    private async sendGenericWebhook(action: RequestedAction, agentName: string): Promise<void> {
        const config = this.config['generic-webhook'];
        if (!config) throw new Error('Generic webhook config not set');

        const method = config.method || 'POST';
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(config.headers || {})
        };

        const body = action.webhookPayload
            ? JSON.stringify(action.webhookPayload)
            : JSON.stringify({
                title: action.title,
                message: action.message,
                severity: action.severity,
                agent: agentName,
                timestamp: new Date().toISOString()
            });

        const response = await fetch(config.url, { method, headers, body });

        if (!response.ok) {
            throw new Error(`Generic webhook failed: ${response.status} ${response.statusText}`);
        }
    }

    private async triggerPipeline(action: RequestedAction, agentName: string): Promise<void> {
        const config = this.config['pipeline-trigger'];
        if (!config) throw new Error('Pipeline trigger config not set');

        const pat = process.env.DEVOPS_PAT || config.pat;
        if (!pat) throw new Error('DEVOPS_PAT env var not set');

        const url = `${config.orgUrl}/${config.project}/_apis/pipelines/${config.pipelineId}/runs?api-version=7.0`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${Buffer.from(`:${pat}`).toString('base64')}`
            },
            body: JSON.stringify({
                resources: { repositories: { self: { refName: 'refs/heads/main' } } },
                templateParameters: {
                    agentName,
                    investigationId: action.investigationId || ''
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Pipeline trigger failed: ${response.status} ${response.statusText}`);
        }
    }
}
