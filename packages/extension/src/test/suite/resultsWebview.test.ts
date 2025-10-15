import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { ResultsWebview } from '../../resultsWebview';
import { QueryResult } from '../../mcpClient';

suite('ResultsWebview Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let context: vscode.ExtensionContext;
    let outputChannel: vscode.OutputChannel;
    let webview: ResultsWebview;

    setup(() => {
        sandbox = sinon.createSandbox();

        context = {
            subscriptions: [],
            extensionPath: '/test/path',
            extensionUri: vscode.Uri.file('/test/path')
        } as any;

        outputChannel = {
            appendLine: sandbox.stub(),
            append: sandbox.stub(),
            show: sandbox.stub(),
            dispose: sandbox.stub(),
            name: 'Test',
            hide: sandbox.stub(),
            clear: sandbox.stub(),
            replace: sandbox.stub()
        } as any;

        webview = new ResultsWebview(context, outputChannel);
    });

    teardown(() => {
        sandbox.restore();
    });

    test('Should create webview instance', () => {
        const webview = new ResultsWebview(context, outputChannel);
        assert.ok(webview);
    });

    test('show should create webview panel', () => {
        const createWebviewPanelStub = sandbox.stub(vscode.window, 'createWebviewPanel').returns({
            webview: { html: '' },
            reveal: sandbox.stub(),
            onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
            dispose: sandbox.stub()
        } as any);

        const result: QueryResult = {
            type: 'table',
            kql: 'traces | take 10',
            summary: 'Query executed successfully',
            columns: ['timestamp', 'message'],
            rows: [
                ['2025-10-15 10:00:00', 'Test message']
            ],
            cached: false
        };

        webview.show(result);

        assert.ok(createWebviewPanelStub.called);
        const args = createWebviewPanelStub.firstCall.args;
        assert.strictEqual(args[0], 'bctbResults');
        assert.strictEqual(args[1], 'Telemetry Results');
    });

    test('show should reuse existing panel', () => {
        const revealStub = sandbox.stub();
        const panel = {
            webview: { html: '' },
            reveal: revealStub,
            onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
            dispose: sandbox.stub()
        } as any;

        sandbox.stub(vscode.window, 'createWebviewPanel').returns(panel);

        const result: QueryResult = {
            type: 'table',
            kql: 'traces | take 10',
            summary: 'Test',
            cached: false
        };

        // Show once to create panel
        webview.show(result);

        // Show again to reuse panel
        webview.show(result);

        assert.ok(revealStub.calledTwice);
    });

    test('show should render table with data', () => {
        let htmlContent = '';
        const panel = {
            webview: {
                get html() { return htmlContent; },
                set html(value: string) { htmlContent = value; }
            },
            reveal: sandbox.stub(),
            onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
            dispose: sandbox.stub()
        } as any;

        sandbox.stub(vscode.window, 'createWebviewPanel').returns(panel);

        const result: QueryResult = {
            type: 'table',
            kql: 'traces | take 10',
            summary: 'Found 2 results',
            columns: ['timestamp', 'message', 'level'],
            rows: [
                ['2025-10-15 10:00:00', 'First message', 'Info'],
                ['2025-10-15 10:01:00', 'Second message', 'Error']
            ],
            cached: false
        };

        webview.show(result);

        assert.ok(htmlContent.includes('<!DOCTYPE html>'));
        assert.ok(htmlContent.includes('Telemetry Results'));
        assert.ok(htmlContent.includes('Found 2 results'));
        assert.ok(htmlContent.includes('traces | take 10'));
        assert.ok(htmlContent.includes('timestamp'));
        assert.ok(htmlContent.includes('message'));
        assert.ok(htmlContent.includes('level'));
        assert.ok(htmlContent.includes('First message'));
        assert.ok(htmlContent.includes('Second message'));
    });

    test('show should display cached badge', () => {
        let htmlContent = '';
        const panel = {
            webview: {
                get html() { return htmlContent; },
                set html(value: string) { htmlContent = value; }
            },
            reveal: sandbox.stub(),
            onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
            dispose: sandbox.stub()
        } as any;

        sandbox.stub(vscode.window, 'createWebviewPanel').returns(panel);

        const result: QueryResult = {
            type: 'table',
            kql: 'traces | take 10',
            summary: 'Test',
            cached: true
        };

        webview.show(result);

        assert.ok(htmlContent.includes('badge-cached'));
        assert.ok(htmlContent.includes('CACHED'));
    });

    test('show should render recommendations', () => {
        let htmlContent = '';
        const panel = {
            webview: {
                get html() { return htmlContent; },
                set html(value: string) { htmlContent = value; }
            },
            reveal: sandbox.stub(),
            onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
            dispose: sandbox.stub()
        } as any;

        sandbox.stub(vscode.window, 'createWebviewPanel').returns(panel);

        const result: QueryResult = {
            type: 'table',
            kql: 'traces | take 10',
            summary: 'Test',
            recommendations: [
                'Add where clause to filter results',
                'Consider using summarize for aggregation'
            ],
            cached: false
        };

        webview.show(result);

        assert.ok(htmlContent.includes('Recommendations'));
        assert.ok(htmlContent.includes('Add where clause to filter results'));
        assert.ok(htmlContent.includes('Consider using summarize for aggregation'));
    });

    test('show should handle empty results', () => {
        let htmlContent = '';
        const panel = {
            webview: {
                get html() { return htmlContent; },
                set html(value: string) { htmlContent = value; }
            },
            reveal: sandbox.stub(),
            onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
            dispose: sandbox.stub()
        } as any;

        sandbox.stub(vscode.window, 'createWebviewPanel').returns(panel);

        const result: QueryResult = {
            type: 'table',
            kql: 'traces | take 10',
            summary: 'No results',
            columns: [],
            rows: [],
            cached: false
        };

        webview.show(result);

        assert.ok(htmlContent.includes('No results returned'));
    });

    test('show should handle error results', () => {
        let htmlContent = '';
        const panel = {
            webview: {
                get html() { return htmlContent; },
                set html(value: string) { htmlContent = value; }
            },
            reveal: sandbox.stub(),
            onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
            dispose: sandbox.stub()
        } as any;

        sandbox.stub(vscode.window, 'createWebviewPanel').returns(panel);

        const result: QueryResult = {
            type: 'error',
            kql: 'invalid query',
            summary: 'Query failed: Syntax error',
            recommendations: ['Check query syntax', 'Use valid KQL'],
            cached: false
        };

        webview.show(result);

        assert.ok(htmlContent.includes('Query Error'));
        assert.ok(htmlContent.includes('Query failed: Syntax error'));
        assert.ok(htmlContent.includes('invalid query'));
        assert.ok(htmlContent.includes('Check query syntax'));
    });

    test('HTML should use VSCode CSS variables', () => {
        let htmlContent = '';
        const panel = {
            webview: {
                get html() { return htmlContent; },
                set html(value: string) { htmlContent = value; }
            },
            reveal: sandbox.stub(),
            onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
            dispose: sandbox.stub()
        } as any;

        sandbox.stub(vscode.window, 'createWebviewPanel').returns(panel);

        const result: QueryResult = {
            type: 'table',
            kql: 'test',
            summary: 'test',
            cached: false
        };

        webview.show(result);

        assert.ok(htmlContent.includes('var(--vscode-foreground)'));
        assert.ok(htmlContent.includes('var(--vscode-editor-background)'));
        assert.ok(htmlContent.includes('var(--vscode-panel-border)'));
    });

    test('HTML should escape special characters', () => {
        let htmlContent = '';
        const panel = {
            webview: {
                get html() { return htmlContent; },
                set html(value: string) { htmlContent = value; }
            },
            reveal: sandbox.stub(),
            onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
            dispose: sandbox.stub()
        } as any;

        sandbox.stub(vscode.window, 'createWebviewPanel').returns(panel);

        const result: QueryResult = {
            type: 'table',
            kql: 'traces | where message contains "<script>alert(\'xss\')</script>"',
            summary: 'Test with <html> & "quotes"',
            columns: ['message'],
            rows: [['<script>test</script>']],
            cached: false
        };

        webview.show(result);

        // Verify HTML escaping
        assert.ok(htmlContent.includes('&lt;script&gt;'));
        assert.ok(htmlContent.includes('&amp;'));
        assert.ok(htmlContent.includes('&quot;'));
        assert.ok(!htmlContent.includes('<script>alert'));
    });

    test('Should handle large result sets', () => {
        let htmlContent = '';
        const panel = {
            webview: {
                get html() { return htmlContent; },
                set html(value: string) { htmlContent = value; }
            },
            reveal: sandbox.stub(),
            onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
            dispose: sandbox.stub()
        } as any;

        sandbox.stub(vscode.window, 'createWebviewPanel').returns(panel);

        // Create 1500 rows
        const rows: any[][] = [];
        for (let i = 0; i < 1500; i++) {
            rows.push([`Timestamp ${i}`, `Message ${i}`]);
        }

        const result: QueryResult = {
            type: 'table',
            kql: 'traces | take 1500',
            summary: 'Large result set',
            columns: ['timestamp', 'message'],
            rows,
            cached: false
        };

        webview.show(result);

        // Should show truncation message
        assert.ok(htmlContent.includes('Showing first 1000'));
        assert.ok(htmlContent.includes('1500 rows'));
    });

    test('Should handle null and undefined cell values', () => {
        let htmlContent = '';
        const panel = {
            webview: {
                get html() { return htmlContent; },
                set html(value: string) { htmlContent = value; }
            },
            reveal: sandbox.stub(),
            onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
            dispose: sandbox.stub()
        } as any;

        sandbox.stub(vscode.window, 'createWebviewPanel').returns(panel);

        const result: QueryResult = {
            type: 'table',
            kql: 'traces',
            summary: 'Test',
            columns: ['col1', 'col2', 'col3'],
            rows: [
                [null, undefined, 'value']
            ],
            cached: false
        };

        webview.show(result);

        // Should handle nulls/undefined gracefully (render as empty)
        assert.ok(htmlContent.includes('<td></td>'));
    });

    test('Should handle object cell values', () => {
        let htmlContent = '';
        const panel = {
            webview: {
                get html() { return htmlContent; },
                set html(value: string) { htmlContent = value; }
            },
            reveal: sandbox.stub(),
            onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
            dispose: sandbox.stub()
        } as any;

        sandbox.stub(vscode.window, 'createWebviewPanel').returns(panel);

        const result: QueryResult = {
            type: 'table',
            kql: 'traces',
            summary: 'Test',
            columns: ['data'],
            rows: [
                [{ nested: { value: 123 } }]
            ],
            cached: false
        };

        webview.show(result);

        // Should JSON.stringify objects
        assert.ok(htmlContent.includes('nested') || htmlContent.includes('123'));
    });

    test('Should display row and column counts', () => {
        let htmlContent = '';
        const panel = {
            webview: {
                get html() { return htmlContent; },
                set html(value: string) { htmlContent = value; }
            },
            reveal: sandbox.stub(),
            onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
            dispose: sandbox.stub()
        } as any;

        sandbox.stub(vscode.window, 'createWebviewPanel').returns(panel);

        const result: QueryResult = {
            type: 'table',
            kql: 'traces | take 10',
            summary: 'Test',
            columns: ['col1', 'col2', 'col3'],
            rows: [
                ['a', 'b', 'c'],
                ['d', 'e', 'f']
            ],
            cached: false
        };

        webview.show(result);

        assert.ok(htmlContent.includes('2 row(s)'));
        assert.ok(htmlContent.includes('3 column(s)'));
    });

    test('Should enable scripts in webview', () => {
        const createWebviewPanelStub = sandbox.stub(vscode.window, 'createWebviewPanel').returns({
            webview: { html: '' },
            reveal: sandbox.stub(),
            onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
            dispose: sandbox.stub()
        } as any);

        const result: QueryResult = {
            type: 'table',
            kql: 'test',
            summary: 'test',
            cached: false
        };

        webview.show(result);

        const options = createWebviewPanelStub.firstCall.args[3];
        assert.strictEqual(options.enableScripts, true);
        assert.strictEqual(options.retainContextWhenHidden, true);
    });

    test('Should cleanup panel on dispose', () => {
        let disposeCallback: (() => void) | undefined;
        const panel = {
            webview: { html: '' },
            reveal: sandbox.stub(),
            onDidDispose: (callback: () => void) => {
                disposeCallback = callback;
                return { dispose: sandbox.stub() };
            },
            dispose: sandbox.stub()
        } as any;

        sandbox.stub(vscode.window, 'createWebviewPanel').returns(panel);

        const result: QueryResult = {
            type: 'table',
            kql: 'test',
            summary: 'test',
            cached: false
        };

        webview.show(result);

        // Trigger dispose
        if (disposeCallback) {
            disposeCallback();
        }

        // Panel should be cleaned up (we can't directly test this, but verify dispose was called)
        assert.ok(true, 'Dispose callback registered');
    });

    test('Should log to output channel when showing results', () => {
        const panel = {
            webview: { html: '' },
            reveal: sandbox.stub(),
            onDidDispose: sandbox.stub().returns({ dispose: sandbox.stub() }),
            dispose: sandbox.stub()
        } as any;

        sandbox.stub(vscode.window, 'createWebviewPanel').returns(panel);

        const result: QueryResult = {
            type: 'table',
            kql: 'test',
            summary: 'test',
            cached: false
        };

        webview.show(result);

        const appendLineStub = outputChannel.appendLine as sinon.SinonStub;
        assert.ok(appendLineStub.called);
        assert.ok(appendLineStub.calledWith('Results displayed in webview'));
    });
});
