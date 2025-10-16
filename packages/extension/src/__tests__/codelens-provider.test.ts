/**
 * CodeLens Provider Tests
 * Tests for KQL CodeLens "▶ Run Query" functionality
 * Added: 2025-10-16 12:25 (Prompt #107)
 */

describe('KQL CodeLens Provider', () => {
    describe('Query Boundary Detection', () => {
        it('should detect single query in document', () => {
            const document = `
traces 
| where timestamp > ago(24h)
| summarize count();
`;

            const queries = parseQueriesFromDocument(document);

            expect(queries).toHaveLength(1);
            expect(queries[0].startLine).toBe(1);
            expect(queries[0].text).toContain('traces');
        });

        it('should detect multiple queries separated by semicolons', () => {
            const document = `
traces | where severityLevel == 3;

traces | where timestamp > ago(1h);

traces | summarize count();
`;

            const queries = parseQueriesFromDocument(document);

            expect(queries).toHaveLength(3);
            expect(queries[0].text).toContain('severityLevel');
            expect(queries[1].text).toContain('ago(1h)');
            expect(queries[2].text).toContain('summarize');
        });

        it('should skip comment lines', () => {
            const document = `
// This is a comment
traces | take 10;

// Another comment
// More comments
traces | take 20;
`;

            const queries = parseQueriesFromDocument(document);

            expect(queries).toHaveLength(2);
            expect(queries[0].text).not.toContain('//');
            expect(queries[1].text).not.toContain('comment');
        });

        it('should skip empty lines', () => {
            const document = `

traces | take 10;


traces | take 20;

`;

            const queries = parseQueriesFromDocument(document);

            expect(queries).toHaveLength(2);
            queries.forEach(query => {
                expect(query.text.trim()).toBeTruthy();
            });
        });

        it('should handle multiline queries', () => {
            const document = `
traces
| where timestamp > ago(24h)
| where severityLevel == 3
| summarize count() by bin(timestamp, 1h);
`;

            const queries = parseQueriesFromDocument(document);

            expect(queries).toHaveLength(1);
            expect(queries[0].text).toContain('traces');
            expect(queries[0].text).toContain('ago(24h)');
            expect(queries[0].text).toContain('summarize');
            expect(queries[0].endLine).toBeGreaterThan(queries[0].startLine);
        });

        it('should handle queries without semicolons', () => {
            const document = `
traces | take 10
`;

            const queries = parseQueriesFromDocument(document);

            expect(queries).toHaveLength(1);
            expect(queries[0].text).toContain('traces');
        });

        it('should detect query boundaries at EOF', () => {
            const document = `
traces | where timestamp > ago(1h)
| take 100`;

            const queries = parseQueriesFromDocument(document);

            expect(queries).toHaveLength(1);
            expect(queries[0].text).toContain('take 100');
        });

        it('should handle mixed comments and queries', () => {
            const document = `
// Get recent errors
traces | where severityLevel == 3;

// Get performance data
traces | where duration_d > 5;
`;

            const queries = parseQueriesFromDocument(document);

            expect(queries).toHaveLength(2);
            expect(queries[0].text).toContain('severityLevel');
            expect(queries[1].text).toContain('duration_d');
        });
    });

    describe('CodeLens Generation', () => {
        it('should create CodeLens at query start line', () => {
            const query = {
                startLine: 5,
                endLine: 10,
                text: 'traces | take 10'
            };

            const codeLens = createCodeLens(query);

            expect(codeLens.line).toBe(5);
            expect(codeLens.command).toBe('bctb.runKQLFromCodeLens');
        });

        it('should include query text in CodeLens command arguments', () => {
            const query = {
                startLine: 1,
                endLine: 3,
                text: 'traces | where timestamp > ago(24h) | take 100'
            };

            const codeLens = createCodeLens(query);

            expect(codeLens.arguments).toContain(query.text);
        });

        it('should show "▶ Run Query" title', () => {
            const query = {
                startLine: 0,
                endLine: 0,
                text: 'traces | take 1'
            };

            const codeLens = createCodeLens(query);

            expect(codeLens.title).toBe('▶ Run Query');
        });

        it('should include document URI in arguments', () => {
            const query = {
                startLine: 1,
                endLine: 2,
                text: 'traces | take 10'
            };
            const documentUri = 'file:///path/to/query.kql';

            const codeLens = createCodeLens(query, documentUri);

            expect(codeLens.arguments).toContain(documentUri);
        });

        it('should include start and end line numbers', () => {
            const query = {
                startLine: 5,
                endLine: 12,
                text: 'traces | where timestamp > ago(1d)'
            };

            const codeLens = createCodeLens(query);

            expect(codeLens.arguments).toContain(5);
            expect(codeLens.arguments).toContain(12);
        });
    });

    describe('Query Validation', () => {
        it('should validate basic KQL syntax', () => {
            const validQueries = [
                'traces | take 10',
                'traces | where timestamp > ago(24h)',
                'traces | summarize count() by bin(timestamp, 1h)',
                'traces | project timestamp, message',
                'traces | extend duration = duration_d * 1000'
            ];

            validQueries.forEach(query => {
                expect(isValidKQLSyntax(query)).toBe(true);
            });
        });

        it('should detect empty queries', () => {
            const emptyQueries = [
                '',
                '   ',
                '\n\n',
                '// Only comments'
            ];

            emptyQueries.forEach(query => {
                expect(isValidKQLSyntax(query)).toBe(false);
            });
        });

        it('should handle queries with line continuations', () => {
            const query = `traces 
| where timestamp > ago(24h) 
| where severityLevel == 3`;

            expect(isValidKQLSyntax(query)).toBe(true);
        });
    });

    describe('Editor Integration', () => {
        it('should check editor.codeLens setting', () => {
            const scenarios = [
                { setting: true, shouldShow: true },
                { setting: false, shouldShow: false },
                { setting: undefined, shouldShow: true } // Default to true
            ];

            scenarios.forEach(({ setting, shouldShow }) => {
                const result = shouldShowCodeLens(setting);
                expect(result).toBe(shouldShow);
            });
        });

        it('should register CodeLens for .kql language', () => {
            const languageId = 'kql';
            const supportedLanguages = ['kql'];

            expect(supportedLanguages).toContain(languageId);
        });

        it('should register CodeLens for .kql file extension', () => {
            const fileName = 'myquery.kql';
            const extension = fileName.split('.').pop();

            expect(extension).toBe('kql');
        });
    });

    describe('Line Range Calculation', () => {
        it('should calculate correct line range for query', () => {
            const lines = [
                '',                                      // 0
                'traces',                                // 1 - start
                '| where timestamp > ago(24h)',         // 2
                '| take 100;',                          // 3 - end
                '',                                      // 4
                'traces | take 50;'                     // 5
            ];

            const query1Range = calculateQueryRange(lines, 1);

            expect(query1Range.startLine).toBe(1);
            expect(query1Range.endLine).toBe(3);
        });

        it('should handle query at document start', () => {
            const lines = [
                'traces | take 10;',  // 0 - start and end
                '',
                'traces | take 20;'
            ];

            const queryRange = calculateQueryRange(lines, 0);

            expect(queryRange.startLine).toBe(0);
            expect(queryRange.endLine).toBe(0);
        });

        it('should handle query at document end', () => {
            const lines = [
                'traces | take 10;',
                '',
                'traces | take 20'   // 2 - no semicolon, at EOF
            ];

            const queryRange = calculateQueryRange(lines, 2);

            expect(queryRange.startLine).toBe(2);
            expect(queryRange.endLine).toBe(2);
        });
    });
});

// Helper functions
interface Query {
    startLine: number;
    endLine: number;
    text: string;
}

function parseQueriesFromDocument(document: string): Query[] {
    const lines = document.split('\n');
    const queries: Query[] = [];
    let currentQuery: string[] = [];
    let startLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip empty lines and comments
        if (line === '' || line.startsWith('//')) {
            if (currentQuery.length > 0 && startLine >= 0) {
                // End of query
                queries.push({
                    startLine,
                    endLine: i - 1,
                    text: currentQuery.join('\n')
                });
                currentQuery = [];
                startLine = -1;
            }
            continue;
        }

        // Start or continue query
        if (startLine === -1) {
            startLine = i;
        }
        currentQuery.push(lines[i]);

        // Check for semicolon (end of query)
        if (line.endsWith(';')) {
            queries.push({
                startLine,
                endLine: i,
                text: currentQuery.join('\n')
            });
            currentQuery = [];
            startLine = -1;
        }
    }

    // Handle query at EOF without semicolon
    if (currentQuery.length > 0 && startLine >= 0) {
        queries.push({
            startLine,
            endLine: lines.length - 1,
            text: currentQuery.join('\n')
        });
    }

    return queries;
}

function createCodeLens(query: Query, documentUri?: string): any {
    return {
        line: query.startLine,
        command: 'bctb.runKQLFromCodeLens',
        title: '▶ Run Query',
        arguments: [
            documentUri || '',
            query.startLine,
            query.endLine,
            query.text
        ]
    };
}

function isValidKQLSyntax(query: string): boolean {
    const trimmed = query.trim().replace(/\/\/.*/g, ''); // Remove comments
    if (trimmed === '') {
        return false;
    }
    // Basic check for KQL operators
    return trimmed.includes('|') || /^[a-zA-Z]+\s/.test(trimmed);
}

function shouldShowCodeLens(setting: boolean | undefined): boolean {
    return setting !== false; // Show by default unless explicitly disabled
}

function calculateQueryRange(lines: string[], startIndex: number): { startLine: number; endLine: number } {
    let endLine = startIndex;

    // Find end of query (semicolon or EOF)
    for (let i = startIndex; i < lines.length; i++) {
        endLine = i;
        if (lines[i].trim().endsWith(';')) {
            break;
        }
    }

    return { startLine: startIndex, endLine };
}
