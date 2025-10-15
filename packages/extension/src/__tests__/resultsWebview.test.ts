import { ResultsWebview } from '../resultsWebview.js';
import { QueryResult } from '../mcpClient.js';

// Mock vscode module
const mockWebviewPanel = {
    webview: {
        html: ''
    },
    reveal: jest.fn(),
    onDidDispose: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    dispose: jest.fn()
};

const mockCreateWebviewPanel = jest.fn();

// Create vscode mock
jest.mock('vscode', () => ({
    window: {
        createWebviewPanel: jest.fn()
    },
    ViewColumn: {
        Two: 2
    },
    Uri: {
        file: (path: string) => ({ fsPath: path })
    }
}), { virtual: true });

const mockOutputChannel = {
    appendLine: jest.fn(),
    append: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
    name: 'Test',
    hide: jest.fn(),
    clear: jest.fn(),
    replace: jest.fn()
};

const mockContext = {
    subscriptions: [],
    extensionPath: '/test/path',
    extensionUri: { fsPath: '/test/path' }
};

describe('ResultsWebview', () => {
    let webview: ResultsWebview;
    let vscode: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Get mocked vscode
        vscode = require('vscode');
        vscode.window.createWebviewPanel = mockCreateWebviewPanel;
        mockCreateWebviewPanel.mockReturnValue(mockWebviewPanel);

        webview = new ResultsWebview(mockContext as any, mockOutputChannel as any);
    });

    describe('constructor', () => {
        it('should create webview instance', () => {
            expect(webview).toBeDefined();
        });
    });

    describe('show', () => {
        it('should create webview panel', () => {
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

            expect(mockCreateWebviewPanel).toHaveBeenCalledWith(
                'bctbResults',
                'Telemetry Results',
                2, // ViewColumn.Two
                expect.objectContaining({
                    enableScripts: true,
                    retainContextWhenHidden: true
                })
            );
        });

        it('should reuse existing panel', () => {
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

            expect(mockCreateWebviewPanel).toHaveBeenCalledTimes(1);
            // Reveal is called once when reusing (first show doesn't call reveal, it creates)
            expect(mockWebviewPanel.reveal).toHaveBeenCalledTimes(1);
        });

        it('should render table with data', () => {
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

            const html = mockWebviewPanel.webview.html;
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('Telemetry Results');
            expect(html).toContain('Found 2 results');
            expect(html).toContain('traces | take 10');
            expect(html).toContain('timestamp');
            expect(html).toContain('message');
            expect(html).toContain('level');
            expect(html).toContain('First message');
            expect(html).toContain('Second message');
        });

        it('should display cached badge', () => {
            const result: QueryResult = {
                type: 'table',
                kql: 'traces | take 10',
                summary: 'Test',
                cached: true
            };

            webview.show(result);

            const html = mockWebviewPanel.webview.html;
            expect(html).toContain('badge-cached');
            expect(html).toContain('CACHED');
        });

        it('should render recommendations', () => {
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

            const html = mockWebviewPanel.webview.html;
            expect(html).toContain('Recommendations');
            expect(html).toContain('Add where clause to filter results');
            expect(html).toContain('Consider using summarize for aggregation');
        });

        it('should handle empty results', () => {
            const result: QueryResult = {
                type: 'table',
                kql: 'traces | take 10',
                summary: 'No results',
                columns: [],
                rows: [],
                cached: false
            };

            webview.show(result);

            const html = mockWebviewPanel.webview.html;
            expect(html).toContain('No results returned');
        });

        it('should handle error results', () => {
            const result: QueryResult = {
                type: 'error',
                kql: 'invalid query',
                summary: 'Query failed: Syntax error',
                recommendations: ['Check query syntax', 'Use valid KQL'],
                cached: false
            };

            webview.show(result);

            const html = mockWebviewPanel.webview.html;
            expect(html).toContain('Query Error');
            expect(html).toContain('Query failed: Syntax error');
            expect(html).toContain('invalid query');
            expect(html).toContain('Check query syntax');
        });

        it('should use VSCode CSS variables', () => {
            const result: QueryResult = {
                type: 'table',
                kql: 'test',
                summary: 'test',
                cached: false
            };

            webview.show(result);

            const html = mockWebviewPanel.webview.html;
            expect(html).toContain('var(--vscode-foreground)');
            expect(html).toContain('var(--vscode-editor-background)');
            expect(html).toContain('var(--vscode-panel-border)');
        });

        it('should escape HTML special characters', () => {
            const result: QueryResult = {
                type: 'table',
                kql: 'traces | where message contains "<script>alert(\'xss\')</script>"',
                summary: 'Test with <html> & "quotes"',
                columns: ['message'],
                rows: [['<script>test</script>']],
                cached: false
            };

            webview.show(result);

            const html = mockWebviewPanel.webview.html;
            expect(html).toContain('&lt;script&gt;');
            expect(html).toContain('&amp;');
            expect(html).toContain('&quot;');
            expect(html).not.toContain('<script>alert');
        });

        it('should handle large result sets', () => {
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

            const html = mockWebviewPanel.webview.html;
            expect(html).toContain('Showing first 1000');
            expect(html).toContain('1500 rows');
        });

        it('should handle null and undefined cell values', () => {
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

            const html = mockWebviewPanel.webview.html;
            // Should handle nulls/undefined gracefully (render as empty)
            expect(html).toContain('<td></td>');
        });

        it('should handle object cell values', () => {
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

            const html = mockWebviewPanel.webview.html;
            // Should JSON.stringify objects
            expect(html).toMatch(/nested|123/);
        });

        it('should display row and column counts', () => {
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

            const html = mockWebviewPanel.webview.html;
            expect(html).toContain('2 row(s)');
            expect(html).toContain('3 column(s)');
        });

        it('should log to output channel when showing results', () => {
            const result: QueryResult = {
                type: 'table',
                kql: 'test',
                summary: 'test',
                cached: false
            };

            webview.show(result);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('Results displayed in webview');
        });

        it('should cleanup panel on dispose', () => {
            let disposeCallback: (() => void) | undefined;

            mockWebviewPanel.onDidDispose = jest.fn((callback: () => void) => {
                disposeCallback = callback;
                return { dispose: jest.fn() };
            });

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

            // Panel should be cleaned up
            expect(mockWebviewPanel.onDidDispose).toHaveBeenCalled();
        });

        it('should handle results without recommendations', () => {
            const result: QueryResult = {
                type: 'table',
                kql: 'test',
                summary: 'test',
                cached: false
            };

            webview.show(result);

            const html = mockWebviewPanel.webview.html;
            // Should not have recommendations section
            expect(html).not.toContain('💡 Recommendations');
        });

        it('should handle results without rows but with columns', () => {
            const result: QueryResult = {
                type: 'table',
                kql: 'test',
                summary: 'test',
                columns: ['col1', 'col2'],
                rows: [],
                cached: false
            };

            webview.show(result);

            const html = mockWebviewPanel.webview.html;
            expect(html).toContain('No results returned');
        });
    });
});
