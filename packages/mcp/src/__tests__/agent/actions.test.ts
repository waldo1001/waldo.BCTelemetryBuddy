/**
 * Tests for ActionDispatcher — external action execution (Teams, email, webhooks, pipelines).
 *
 * All HTTP calls are mocked via global.fetch. No real network calls.
 * Each test verifies:
 * - Correct URL and headers
 * - Correct body format
 * - Success/failure status mapping
 * - Missing config error handling
 */

import { ActionDispatcher, parseMarkdownToAdaptiveCardBody } from '../../agent/actions';
import { ActionConfig, RequestedAction } from '../../agent/types';

// ─── Mock fetch ──────────────────────────────────────────────────────────────

const originalFetch = global.fetch;

beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({ access_token: 'mock-token' }),
        text: () => Promise.resolve('')
    });
});

afterEach(() => {
    global.fetch = originalFetch;
});

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createFullConfig(): ActionConfig {
    return {
        'teams-webhook': {
            url: 'https://outlook.office.com/webhook/test'
        },
        'email-smtp': {
            host: 'smtp.test.com',
            port: 587,
            secure: false,
            auth: { user: 'apikey', pass: 'test-pass' },
            from: 'agent@test.com',
            defaultTo: ['dev@test.com']
        },
        'email-graph': {
            tenantId: 'test-tenant',
            clientId: 'test-client',
            from: 'agent@test.com',
            defaultTo: ['dev@test.com']
        },
        'generic-webhook': {
            url: 'https://hooks.slack.com/test',
            method: 'POST',
            headers: { 'X-Custom': 'value' }
        },
        'pipeline-trigger': {
            orgUrl: 'https://dev.azure.com/contoso',
            project: 'BC-Ops',
            pipelineId: 42,
            pat: 'test-pat'
        }
    };
}

function createAction(overrides?: Partial<RequestedAction>): RequestedAction {
    return {
        type: 'teams-webhook',
        title: 'Test Alert',
        message: 'Something happened.',
        severity: 'medium',
        ...overrides
    };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ActionDispatcher', () => {

    // ─── isConfigured ────────────────────────────────────────────────────

    describe('isConfigured', () => {
        it('should return true for configured action types', () => {
            const dispatcher = new ActionDispatcher(createFullConfig());
            expect(dispatcher.isConfigured('teams-webhook')).toBe(true);
            expect(dispatcher.isConfigured('email-graph')).toBe(true);
            expect(dispatcher.isConfigured('generic-webhook')).toBe(true);
            expect(dispatcher.isConfigured('pipeline-trigger')).toBe(true);
        });

        it('should return false for unconfigured action types', () => {
            const dispatcher = new ActionDispatcher({});
            expect(dispatcher.isConfigured('teams-webhook')).toBe(false);
            expect(dispatcher.isConfigured('email-smtp')).toBe(false);
        });
    });

    // ─── dispatch ────────────────────────────────────────────────────────

    describe('dispatch', () => {
        it('should return empty array for no actions', async () => {
            const dispatcher = new ActionDispatcher(createFullConfig());
            const result = await dispatcher.dispatch([], 'test-agent');
            expect(result).toEqual([]);
        });

        it('should return sent status on success', async () => {
            const dispatcher = new ActionDispatcher(createFullConfig());
            const result = await dispatcher.dispatch([createAction()], 'test-agent');

            expect(result).toHaveLength(1);
            expect(result[0].status).toBe('sent');
            expect(result[0].type).toBe('teams-webhook');
            expect(result[0].run).toBe(0);  // set by updateState later
        });

        it('should return failed status on error', async () => {
            (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

            const dispatcher = new ActionDispatcher(createFullConfig());
            const result = await dispatcher.dispatch([createAction()], 'test-agent');

            expect(result).toHaveLength(1);
            expect(result[0].status).toBe('failed');
            expect(result[0].details?.error).toBe('Network error');
        });

        it('should dispatch multiple actions independently', async () => {
            const dispatcher = new ActionDispatcher(createFullConfig());

            // First call succeeds, second fails
            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' })
                .mockRejectedValueOnce(new Error('Timeout'));

            const actions = [
                createAction({ type: 'teams-webhook', title: 'Alert 1' }),
                createAction({ type: 'generic-webhook', title: 'Alert 2' })
            ];

            const result = await dispatcher.dispatch(actions, 'test-agent');

            expect(result).toHaveLength(2);
            expect(result[0].status).toBe('sent');
            expect(result[1].status).toBe('failed');
        });
    });

    // ─── Teams webhook ───────────────────────────────────────────────────

    describe('teams-webhook', () => {
        it('should POST adaptive card to webhook URL', async () => {
            const dispatcher = new ActionDispatcher(createFullConfig());
            await dispatcher.dispatch([createAction()], 'my-agent');

            expect(global.fetch).toHaveBeenCalledTimes(1);
            const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
            expect(url).toBe('https://outlook.office.com/webhook/test');
            expect(opts.method).toBe('POST');

            const body = JSON.parse(opts.body);
            expect(body.type).toBe('message');
            expect(body.attachments[0].content.type).toBe('AdaptiveCard');
        });

        it('should set severity color based on action severity', async () => {
            const dispatcher = new ActionDispatcher(createFullConfig());
            await dispatcher.dispatch([createAction({ severity: 'high' })], 'agent');

            const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
            expect(body.attachments[0].content.body[0].color).toBe('attention');
        });

        it('should fail if URL is not configured', async () => {
            const dispatcher = new ActionDispatcher({});
            const result = await dispatcher.dispatch(
                [createAction({ type: 'teams-webhook' })],
                'agent'
            );

            expect(result[0].status).toBe('failed');
            expect(result[0].details?.error).toContain('not configured');
        });

        it('should fail if HTTP response is not ok', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            const dispatcher = new ActionDispatcher(createFullConfig());
            const result = await dispatcher.dispatch([createAction()], 'agent');

            expect(result[0].status).toBe('failed');
        });
    });

    // ─── Generic webhook ─────────────────────────────────────────────────

    describe('generic-webhook', () => {
        it('should POST to webhook URL with default body', async () => {
            const dispatcher = new ActionDispatcher(createFullConfig());
            await dispatcher.dispatch(
                [createAction({ type: 'generic-webhook' })],
                'my-agent'
            );

            const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
            expect(url).toBe('https://hooks.slack.com/test');

            const body = JSON.parse(opts.body);
            expect(body.title).toBe('Test Alert');
            expect(body.agent).toBe('my-agent');
        });

        it('should use custom headers from config', async () => {
            const dispatcher = new ActionDispatcher(createFullConfig());
            await dispatcher.dispatch(
                [createAction({ type: 'generic-webhook' })],
                'agent'
            );

            const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers;
            expect(headers['X-Custom']).toBe('value');
        });

        it('should use webhookPayload if provided', async () => {
            const dispatcher = new ActionDispatcher(createFullConfig());
            await dispatcher.dispatch(
                [createAction({
                    type: 'generic-webhook',
                    webhookPayload: { channel: '#alerts', text: 'Custom body' }
                })],
                'agent'
            );

            const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
            expect(body.channel).toBe('#alerts');
            expect(body.text).toBe('Custom body');
        });

        it('should fail if URL is not configured', async () => {
            const dispatcher = new ActionDispatcher({});
            const result = await dispatcher.dispatch(
                [createAction({ type: 'generic-webhook' })],
                'agent'
            );

            expect(result[0].status).toBe('failed');
        });
    });

    // ─── Pipeline trigger ────────────────────────────────────────────────

    describe('pipeline-trigger', () => {
        it('should POST to Azure DevOps pipeline API', async () => {
            const dispatcher = new ActionDispatcher(createFullConfig());
            await dispatcher.dispatch(
                [createAction({ type: 'pipeline-trigger' })],
                'my-agent'
            );

            const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
            expect(url).toContain('dev.azure.com/contoso');
            expect(url).toContain('pipelines/42/runs');

            const body = JSON.parse(opts.body);
            expect(body.templateParameters.agentName).toBe('my-agent');
        });

        it('should use PAT from env var if set', async () => {
            process.env.DEVOPS_PAT = 'env-pat';
            const config = createFullConfig();
            delete config['pipeline-trigger']!.pat;

            const dispatcher = new ActionDispatcher(config);
            await dispatcher.dispatch(
                [createAction({ type: 'pipeline-trigger' })],
                'agent'
            );

            const auth = (global.fetch as jest.Mock).mock.calls[0][1].headers.Authorization;
            expect(auth).toContain('Basic');
            expect(Buffer.from(auth.replace('Basic ', ''), 'base64').toString()).toContain('env-pat');

            delete process.env.DEVOPS_PAT;
        });

        it('should fail if config is missing', async () => {
            const dispatcher = new ActionDispatcher({});
            const result = await dispatcher.dispatch(
                [createAction({ type: 'pipeline-trigger' })],
                'agent'
            );

            expect(result[0].status).toBe('failed');
        });
    });

    // ─── Email via Graph ─────────────────────────────────────────────────

    describe('email-graph', () => {
        it('should acquire token then send mail', async () => {
            process.env.GRAPH_CLIENT_SECRET = 'test-secret';

            const dispatcher = new ActionDispatcher(createFullConfig());
            await dispatcher.dispatch(
                [createAction({ type: 'email-graph' })],
                'agent'
            );

            // Should have made 2 fetch calls: token + sendMail
            expect(global.fetch).toHaveBeenCalledTimes(2);

            const tokenCall = (global.fetch as jest.Mock).mock.calls[0];
            expect(tokenCall[0]).toContain('login.microsoftonline.com');

            const mailCall = (global.fetch as jest.Mock).mock.calls[1];
            expect(mailCall[0]).toContain('graph.microsoft.com');
            expect(mailCall[0]).toContain('sendMail');

            delete process.env.GRAPH_CLIENT_SECRET;
        });

        it('should use action recipients over defaults', async () => {
            process.env.GRAPH_CLIENT_SECRET = 'test-secret';

            const dispatcher = new ActionDispatcher(createFullConfig());
            await dispatcher.dispatch(
                [createAction({ type: 'email-graph', recipients: ['custom@test.com'] })],
                'agent'
            );

            const mailBody = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
            expect(mailBody.message.toRecipients[0].emailAddress.address).toBe('custom@test.com');

            delete process.env.GRAPH_CLIENT_SECRET;
        });

        it('should fail without GRAPH_CLIENT_SECRET', async () => {
            delete process.env.GRAPH_CLIENT_SECRET;

            const dispatcher = new ActionDispatcher(createFullConfig());
            const result = await dispatcher.dispatch(
                [createAction({ type: 'email-graph' })],
                'agent'
            );

            expect(result[0].status).toBe('failed');
            expect(result[0].details?.error).toContain('GRAPH_CLIENT_SECRET');
        });

        it('should fail if token acquisition fails', async () => {
            process.env.GRAPH_CLIENT_SECRET = 'test-secret';
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized'
            });

            const dispatcher = new ActionDispatcher(createFullConfig());
            const result = await dispatcher.dispatch(
                [createAction({ type: 'email-graph' })],
                'agent'
            );

            expect(result[0].status).toBe('failed');
            delete process.env.GRAPH_CLIENT_SECRET;
        });
    });

    // ─── Email via SMTP ──────────────────────────────────────────────────

    describe('email-smtp', () => {
        it('should fail if SMTP config is missing', async () => {
            const dispatcher = new ActionDispatcher({});
            const result = await dispatcher.dispatch(
                [createAction({ type: 'email-smtp' })],
                'agent'
            );

            expect(result[0].status).toBe('failed');
            expect(result[0].details?.error).toContain('SMTP email config not set');
        });

        it('should fail if nodemailer is not available', async () => {
            // nodemailer isn't actually installed, so require() will fail
            const dispatcher = new ActionDispatcher(createFullConfig());
            const result = await dispatcher.dispatch(
                [createAction({ type: 'email-smtp' })],
                'agent'
            );

            // Should fail because nodemailer isn't installed in test environment
            expect(result[0].status).toBe('failed');
        });
    });

    // ─── Unknown action type ─────────────────────────────────────────────

    describe('unknown action type', () => {
        it('should fail with error for unknown type', async () => {
            const dispatcher = new ActionDispatcher(createFullConfig());
            const result = await dispatcher.dispatch(
                [createAction({ type: 'unknown-type' as any })],
                'agent'
            );

            expect(result[0].status).toBe('failed');
            expect(result[0].details?.error).toContain('Unknown action type');
        });
    });

    // ─── Teams severity colors ───────────────────────────────────────────

    describe('severity colors', () => {
        it('should use "good" color for low severity', async () => {
            const dispatcher = new ActionDispatcher(createFullConfig());
            await dispatcher.dispatch([createAction({ severity: 'low' })], 'agent');

            const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
            expect(body.attachments[0].content.body[0].color).toBe('good');
        });

        it('should use "warning" color for medium severity', async () => {
            const dispatcher = new ActionDispatcher(createFullConfig());
            await dispatcher.dispatch([createAction({ severity: 'medium' })], 'agent');

            const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
            expect(body.attachments[0].content.body[0].color).toBe('warning');
        });
    });

    // ─── generic-webhook HTTP error ──────────────────────────────────────

    describe('generic-webhook HTTP error', () => {
        it('should fail when webhook returns non-ok response', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 502,
                statusText: 'Bad Gateway'
            });

            const dispatcher = new ActionDispatcher(createFullConfig());
            const result = await dispatcher.dispatch(
                [createAction({ type: 'generic-webhook' })],
                'agent'
            );

            expect(result[0].status).toBe('failed');
            expect(result[0].details?.error).toContain('Generic webhook failed');
        });
    });

    // ─── email-graph missing config ──────────────────────────────────────

    describe('email-graph missing config', () => {
        it('should fail if graph config is not set', async () => {
            process.env.GRAPH_CLIENT_SECRET = 'test-secret';

            const dispatcher = new ActionDispatcher({});
            const result = await dispatcher.dispatch(
                [createAction({ type: 'email-graph' })],
                'agent'
            );

            expect(result[0].status).toBe('failed');
            expect(result[0].details?.error).toContain('Graph email config not set');

            delete process.env.GRAPH_CLIENT_SECRET;
        });

        it('should fail if sendMail returns non-ok response', async () => {
            process.env.GRAPH_CLIENT_SECRET = 'test-secret';

            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({ access_token: 'token' })
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 403,
                    statusText: 'Forbidden'
                });

            const dispatcher = new ActionDispatcher(createFullConfig());
            const result = await dispatcher.dispatch(
                [createAction({ type: 'email-graph' })],
                'agent'
            );

            expect(result[0].status).toBe('failed');
            expect(result[0].details?.error).toContain('Graph sendMail failed');

            delete process.env.GRAPH_CLIENT_SECRET;
        });
    });

    // ─── pipeline-trigger missing PAT ────────────────────────────────────

    describe('pipeline-trigger missing PAT', () => {
        it('should fail if PAT is not available', async () => {
            delete process.env.DEVOPS_PAT;
            const config = createFullConfig();
            delete config['pipeline-trigger']!.pat;

            const dispatcher = new ActionDispatcher(config);
            const result = await dispatcher.dispatch(
                [createAction({ type: 'pipeline-trigger' })],
                'agent'
            );

            expect(result[0].status).toBe('failed');
            expect(result[0].details?.error).toContain('DEVOPS_PAT');
        });

        it('should fail when pipeline API returns non-ok response', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found'
            });

            const dispatcher = new ActionDispatcher(createFullConfig());
            const result = await dispatcher.dispatch(
                [createAction({ type: 'pipeline-trigger' })],
                'agent'
            );

            expect(result[0].status).toBe('failed');
            expect(result[0].details?.error).toContain('Pipeline trigger failed');
        });
    });
});

// ─── parseMarkdownToAdaptiveCardBody Tests ───────────────────────────────────

describe('parseMarkdownToAdaptiveCardBody', () => {
    it('converts plain text to a single TextBlock', () => {
        const body = parseMarkdownToAdaptiveCardBody('Hello world');
        expect(body).toEqual([
            { type: 'TextBlock', text: 'Hello world', wrap: true }
        ]);
    });

    it('converts a markdown table to an Adaptive Card Table element', () => {
        const md = [
            '| Name | Count |',
            '|------|-------|',
            '| Errors | 42 |',
            '| Warnings | 7 |'
        ].join('\n');

        const body = parseMarkdownToAdaptiveCardBody(md);
        expect(body).toHaveLength(1);
        expect(body[0].type).toBe('Table');
        expect(body[0].firstRowAsHeader).toBe(true);
        expect(body[0].showGridLines).toBe(true);
        expect(body[0].columns).toHaveLength(2);
        expect(body[0].rows).toHaveLength(3); // header + 2 data rows
        // header row
        expect(body[0].rows[0].cells[0].items[0].text).toBe('Name');
        expect(body[0].rows[0].cells[0].items[0].weight).toBe('Bolder');
        // data row
        expect(body[0].rows[1].cells[0].items[0].text).toBe('Errors');
        expect(body[0].rows[1].cells[1].items[0].text).toBe('42');
    });

    it('handles text before and after a table', () => {
        const md = [
            'Summary of findings:',
            '',
            '| Metric | Value |',
            '|--------|-------|',
            '| CPU | 95% |',
            '',
            'Please investigate immediately.'
        ].join('\n');

        const body = parseMarkdownToAdaptiveCardBody(md);
        expect(body).toHaveLength(3);
        expect(body[0].type).toBe('TextBlock');
        expect(body[0].text).toContain('Summary');
        expect(body[1].type).toBe('Table');
        expect(body[1].rows).toHaveLength(2); // header + 1 data row
        expect(body[2].type).toBe('TextBlock');
        expect(body[2].text).toContain('investigate');
    });

    it('handles multiple tables in one message', () => {
        const md = [
            '## Errors',
            '| Error | Count |',
            '|-------|-------|',
            '| Timeout | 5 |',
            '',
            '## Warnings',
            '| Warning | Count |',
            '|---------|-------|',
            '| Slow | 12 |'
        ].join('\n');

        const body = parseMarkdownToAdaptiveCardBody(md);
        // TextBlock (## Errors), Table, TextBlock (## Warnings), Table
        const tables = body.filter((b: any) => b.type === 'Table');
        expect(tables).toHaveLength(2);
    });

    it('handles a table with uneven columns (pads missing cells)', () => {
        const md = [
            '| A | B | C |',
            '|---|---|---|',
            '| 1 |',  // missing B and C
        ].join('\n');

        const body = parseMarkdownToAdaptiveCardBody(md);
        expect(body[0].type).toBe('Table');
        expect(body[0].columns).toHaveLength(3);
        // Data row should have 3 cells, with missing ones empty
        const dataRow = body[0].rows[1];
        expect(dataRow.cells).toHaveLength(3);
        expect(dataRow.cells[0].items[0].text).toBe('1');
        expect(dataRow.cells[1].items[0].text).toBe('');
        expect(dataRow.cells[2].items[0].text).toBe('');
    });

    it('handles message with no tables (pure markdown text)', () => {
        const md = '**Bold text** and *italic*\n\nSecond paragraph';
        const body = parseMarkdownToAdaptiveCardBody(md);
        expect(body).toHaveLength(1);
        expect(body[0].type).toBe('TextBlock');
        expect(body[0].text).toContain('Bold text');
    });

    it('handles empty message', () => {
        const body = parseMarkdownToAdaptiveCardBody('');
        expect(body).toHaveLength(0);
    });

    it('preserves header row styling', () => {
        const md = [
            '| Header1 | Header2 |',
            '|---------|---------|',
            '| data1   | data2   |'
        ].join('\n');

        const body = parseMarkdownToAdaptiveCardBody(md);
        expect(body[0].rows[0].style).toBe('accent');
        expect(body[0].rows[0].cells[0].items[0].weight).toBe('Bolder');
        // Data rows should not have Bolder
        expect(body[0].rows[1].cells[0].items[0].weight).toBeUndefined();
    });
});
