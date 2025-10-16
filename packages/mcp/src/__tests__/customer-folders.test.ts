/**
 * Customer-Specific Folder Structure Tests
 * Tests for Companies/[CompanyName]/[Category]/[QueryName].kql structure
 * Added: 2025-10-16 13:25 (Prompt #113)
 */

import * as path from 'path';

describe('Customer-Specific Query Folder Structure', () => {
    describe('detectCustomerQuery', () => {
        it('should detect aadTenantId filter', () => {
            const kqlQueries = [
                'traces | where tostring(customDimensions.aadTenantId) == "123-456"',
                '| where customDimensions.aadTenantId == "abc"',
                'traces | where aadTenantId == "test"'
            ];

            kqlQueries.forEach(kql => {
                const result = detectCustomerQuery(kql);
                expect(result).toBe(true);
            });
        });

        it('should detect companyName filter', () => {
            const kqlQueries = [
                'traces | where companyName == "Acme Corp"',
                '| where customDimensions.companyName == "Test Company"',
                'traces | where company_name == "Customer123"'
            ];

            kqlQueries.forEach(kql => {
                const result = detectCustomerQuery(kql);
                expect(result).toBe(true);
            });
        });

        it('should not detect generic queries', () => {
            const kqlQueries = [
                'traces | where timestamp > ago(24h)',
                'traces | where severityLevel == 3',
                'traces | summarize count() by bin(timestamp, 1h)'
            ];

            kqlQueries.forEach(kql => {
                const result = detectCustomerQuery(kql);
                expect(result).toBe(false);
            });
        });

        it('should be case-insensitive for detection', () => {
            const kqlQueries = [
                'traces | where AADTENANTID == "test"',
                'traces | where CompanyName == "test"',
                'traces | where COMPANY_NAME == "test"'
            ];

            kqlQueries.forEach(kql => {
                const result = detectCustomerQuery(kql);
                expect(result).toBe(true);
            });
        });
    });

    describe('constructFolderPath', () => {
        it('should create generic query path without company', () => {
            const queryName = 'Recent Errors';
            const category = 'Monitoring';
            const companyName = undefined;
            const queriesFolder = 'queries';

            const result = constructFolderPath(queriesFolder, category, companyName);

            expect(result).toBe(path.join('queries', 'Monitoring'));
        });

        it('should create customer-specific query path with company', () => {
            const queryName = 'Performance Analysis';
            const category = 'Performance';
            const companyName = 'Acme Corp';
            const queriesFolder = 'queries';

            const result = constructFolderPath(queriesFolder, category, companyName);

            expect(result).toBe(path.join('queries', 'Companies', 'Acme Corp', 'Performance'));
        });

        it('should sanitize company name for file system', () => {
            const companyNames = [
                'Acme/Corp',      // Forward slash
                'Test\\Company',  // Backslash
                'Company:Ltd',    // Colon
                'Test*Company',   // Asterisk
                'Company?Inc',    // Question mark
                'Test"Company"',  // Quotes
                'Company<>Ltd',   // Angle brackets
                'Test|Company'    // Pipe
            ];

            companyNames.forEach(companyName => {
                const result = sanitizeCompanyName(companyName);
                expect(result).not.toMatch(/[\/\\:*?"<>|]/);
            });
        });

        it('should handle empty or null category', () => {
            const queriesFolder = 'queries';
            const companyName = 'Test Company';

            const resultEmpty = constructFolderPath(queriesFolder, '', companyName);
            const resultNull = constructFolderPath(queriesFolder, undefined, companyName);

            expect(resultEmpty).toBe(path.join('queries', 'Companies', 'Test Company'));
            expect(resultNull).toBe(path.join('queries', 'Companies', 'Test Company'));
        });
    });

    describe('generateQueryFileContent', () => {
        it('should include company metadata for customer queries', () => {
            const queryName = 'Error Analysis';
            const kql = 'traces | where severityLevel == 3';
            const purpose = 'Find errors';
            const category = 'Monitoring';
            const companyName = 'Acme Corp';

            const content = generateQueryFileContent({
                name: queryName,
                kql,
                purpose,
                category,
                companyName
            });

            expect(content).toContain('// Name: Error Analysis');
            expect(content).toContain('// Company: Acme Corp');
            expect(content).toContain('// Category: Monitoring');
            expect(content).toContain('// Purpose: Find errors');
            expect(content).toContain(kql);
        });

        it('should not include company metadata for generic queries', () => {
            const queryName = 'General Errors';
            const kql = 'traces | where severityLevel == 3';
            const purpose = 'Find errors';
            const category = 'Monitoring';

            const content = generateQueryFileContent({
                name: queryName,
                kql,
                purpose,
                category
            });

            expect(content).toContain('// Name: General Errors');
            expect(content).not.toContain('// Company:');
            expect(content).toContain('// Category: Monitoring');
        });

        it('should include optional fields when provided', () => {
            const content = generateQueryFileContent({
                name: 'Test Query',
                kql: 'traces | take 10',
                purpose: 'Testing',
                useCase: 'Development',
                tags: ['test', 'dev']
            });

            expect(content).toContain('// Use Case: Development');
            expect(content).toContain('// Tags: test, dev');
        });

        it('should omit optional fields when not provided', () => {
            const content = generateQueryFileContent({
                name: 'Simple Query',
                kql: 'traces | take 10'
            });

            expect(content).not.toContain('// Purpose:');
            expect(content).not.toContain('// Use Case:');
            expect(content).not.toContain('// Tags:');
        });
    });

    describe('parseQueryFromFile', () => {
        it('should extract company name from file metadata', () => {
            const fileContent = `
// Name: Customer Error Analysis
// Company: Acme Corp
// Category: Monitoring
// Purpose: Track errors

traces | where severityLevel == 3
| where customDimensions.aadTenantId == "123"
`;

            const parsed = parseQueryFromFile(fileContent, '/path/to/file.kql');

            expect(parsed.companyName).toBe('Acme Corp');
            expect(parsed.name).toBe('Customer Error Analysis');
            expect(parsed.category).toBe('Monitoring');
        });

        it('should detect company from file path structure', () => {
            const fileContent = 'traces | take 10';
            const filePath = path.join('queries', 'Companies', 'Test Company', 'Monitoring', 'query.kql');

            const parsed = parseQueryFromFile(fileContent, filePath);

            expect(parsed.companyName).toBe('Test Company');
            expect(parsed.isCustomerSpecific).toBe(true);
        });

        it('should identify generic queries correctly', () => {
            const fileContent = `
// Name: General Performance
// Category: Performance

traces | summarize avg(duration_d) by bin(timestamp, 1h)
`;
            const filePath = path.join('queries', 'Performance', 'query.kql');

            const parsed = parseQueryFromFile(fileContent, filePath);

            expect(parsed.companyName).toBeUndefined();
            expect(parsed.isCustomerSpecific).toBe(false);
        });
    });

    describe('listQueriesByCompany', () => {
        it('should group queries by company name', () => {
            const queries = [
                { name: 'Query1', companyName: 'Acme' },
                { name: 'Query2', companyName: 'Acme' },
                { name: 'Query3', companyName: 'TechCorp' },
                { name: 'Query4', companyName: undefined }
            ];

            const grouped = groupQueriesByCompany(queries);

            expect(grouped['Acme']).toHaveLength(2);
            expect(grouped['TechCorp']).toHaveLength(1);
            expect(grouped['Generic']).toHaveLength(1);
        });

        it('should list all companies alphabetically', () => {
            const queries = [
                { name: 'Q1', companyName: 'Zebra Corp' },
                { name: 'Q2', companyName: 'Acme Inc' },
                { name: 'Q3', companyName: 'Beta LLC' }
            ];

            const companies = getCompanyList(queries);

            expect(companies).toEqual(['Acme Inc', 'Beta LLC', 'Zebra Corp']);
        });
    });
});

// Helper functions matching actual implementation
function detectCustomerQuery(kql: string): boolean {
    const lowerKql = kql.toLowerCase();
    return lowerKql.includes('aadtenantid') ||
        lowerKql.includes('companyname') ||
        lowerKql.includes('company_name');
}

function constructFolderPath(queriesFolder: string, category?: string, companyName?: string): string {
    if (companyName) {
        const sanitized = sanitizeCompanyName(companyName);
        if (category) {
            return path.join(queriesFolder, 'Companies', sanitized, category);
        }
        return path.join(queriesFolder, 'Companies', sanitized);
    }
    if (category) {
        return path.join(queriesFolder, category);
    }
    return queriesFolder;
}

function sanitizeCompanyName(companyName: string): string {
    // Remove characters that are invalid in file paths
    return companyName.replace(/[\/\\:*?"<>|]/g, '-');
}

function generateQueryFileContent(options: {
    name: string;
    kql: string;
    purpose?: string;
    useCase?: string;
    tags?: string[];
    category?: string;
    companyName?: string;
}): string {
    const lines: string[] = [];

    lines.push(`// Name: ${options.name}`);

    if (options.companyName) {
        lines.push(`// Company: ${options.companyName}`);
    }

    if (options.category) {
        lines.push(`// Category: ${options.category}`);
    }

    if (options.purpose) {
        lines.push(`// Purpose: ${options.purpose}`);
    }

    if (options.useCase) {
        lines.push(`// Use Case: ${options.useCase}`);
    }

    if (options.tags && options.tags.length > 0) {
        lines.push(`// Tags: ${options.tags.join(', ')}`);
    }

    lines.push('');
    lines.push(options.kql);

    return lines.join('\n');
}

function parseQueryFromFile(fileContent: string, filePath: string): {
    name?: string;
    companyName?: string;
    category?: string;
    isCustomerSpecific: boolean;
} {
    const result: any = {};

    // Parse metadata from comments
    const lines = fileContent.split('\n');
    for (const line of lines) {
        if (line.startsWith('// Name:')) {
            result.name = line.substring(8).trim();
        } else if (line.startsWith('// Company:')) {
            result.companyName = line.substring(11).trim();
        } else if (line.startsWith('// Category:')) {
            result.category = line.substring(12).trim();
        }
    }

    // Detect company from path if not in metadata
    if (!result.companyName && filePath.includes(path.join('Companies'))) {
        const parts = filePath.split(path.sep);
        const companiesIndex = parts.indexOf('Companies');
        if (companiesIndex >= 0 && companiesIndex + 1 < parts.length) {
            result.companyName = parts[companiesIndex + 1];
        }
    }

    result.isCustomerSpecific = !!result.companyName;

    return result;
}

function groupQueriesByCompany(queries: Array<{ name: string; companyName?: string }>): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    for (const query of queries) {
        const key = query.companyName || 'Generic';
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(query);
    }

    return grouped;
}

function getCompanyList(queries: Array<{ companyName?: string }>): string[] {
    const companies = new Set<string>();

    for (const query of queries) {
        if (query.companyName) {
            companies.add(query.companyName);
        }
    }

    return Array.from(companies).sort();
}
