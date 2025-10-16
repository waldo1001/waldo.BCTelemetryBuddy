import { QueriesService, SavedQuery } from '../queries.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('QueriesService', () => {
    const workspacePath = '/test/workspace';
    const queriesDir = path.join(workspacePath, 'queries'); // Default queries folder

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should create queries directory if it does not exist', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(false);
            mockedFs.mkdirSync.mockReturnValue(undefined);

            // Act
            new QueriesService(workspacePath);

            // Assert
            expect(mockedFs.existsSync).toHaveBeenCalledWith(queriesDir);
            expect(mockedFs.mkdirSync).toHaveBeenCalledWith(queriesDir, { recursive: true });
        });

        it('should not create directory if it already exists', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);

            // Act
            new QueriesService(workspacePath);

            // Assert
            expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
        });
    });

    describe('getAllQueries', () => {
        it('should return empty array when directory does not exist', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(false);
            const service = new QueriesService(workspacePath);

            // Act
            const queries = service.getAllQueries();

            // Assert
            expect(queries).toEqual([]);
        });

        it('should return empty array when directory is empty', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readdirSync.mockReturnValue([] as any);
            const service = new QueriesService(workspacePath);

            // Act
            const queries = service.getAllQueries();

            // Assert
            expect(queries).toEqual([]);
        });

        it('should parse and return .kql files', () => {
            // Arrange
            const fileContent = `// Query: Test Query
// Purpose: Test query purpose
// Use case: Testing
// Created: 2025-10-15
// Tags: test, example

traces
| where timestamp > ago(1h)
| take 10`;

            mockedFs.existsSync.mockReturnValue(true);
            // Mock Dirent objects with name, isDirectory(), isFile()
            mockedFs.readdirSync.mockReturnValue([
                { name: 'test-query.kql', isDirectory: () => false, isFile: () => true }
            ] as any);
            mockedFs.readFileSync.mockReturnValue(fileContent);

            const service = new QueriesService(workspacePath);

            // Act
            const queries = service.getAllQueries();

            // Assert
            expect(queries).toHaveLength(1);
            expect(queries[0]).toMatchObject({
                fileName: 'test-query.kql',
                name: 'Test Query',
                purpose: 'Test query purpose',
                useCase: 'Testing',
                created: '2025-10-15',
                tags: ['test', 'example']
            });
            expect(queries[0].kql).toContain('traces');
        });

        it('should skip non-.kql files', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readdirSync.mockReturnValue([
                { name: 'readme.txt', isDirectory: () => false, isFile: () => true },
                { name: 'test.kql', isDirectory: () => false, isFile: () => true }
            ] as any);
            mockedFs.readFileSync.mockReturnValue('// Query: Test\ntraces | take 10');

            const service = new QueriesService(workspacePath);

            // Act
            const queries = service.getAllQueries();

            // Assert
            expect(queries).toHaveLength(1); // Only test.kql
            expect(mockedFs.readFileSync).toHaveBeenCalledTimes(1);
        });

        it('should handle files without metadata', () => {
            // Arrange
            const fileContent = `traces
| where timestamp > ago(1h)
| take 10`;

            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readdirSync.mockReturnValue([
                { name: 'simple.kql', isDirectory: () => false, isFile: () => true }
            ] as any);
            mockedFs.readFileSync.mockReturnValue(fileContent);

            const service = new QueriesService(workspacePath);

            // Act
            const queries = service.getAllQueries();

            // Assert
            expect(queries).toHaveLength(1);
            expect(queries[0].name).toBe('simple.kql'); // Uses filename as fallback
            expect(queries[0].purpose).toBe('');
            expect(queries[0].tags).toEqual([]);
        });

        it('should skip files with no KQL content', () => {
            // Arrange
            const fileContent = `// Query: Empty Query
// Purpose: This has no KQL
`;

            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readdirSync.mockReturnValue([
                { name: 'empty.kql', isDirectory: () => false, isFile: () => true }
            ] as any);
            mockedFs.readFileSync.mockReturnValue(fileContent);

            const consoleWarnSpy = jest.spyOn(console, 'warn');
            const service = new QueriesService(workspacePath);

            // Act
            const queries = service.getAllQueries();

            // Assert
            expect(queries).toEqual([]);
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('No KQL found'));
        });

        it('should handle read errors gracefully', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readdirSync.mockReturnValue([
                { name: 'error.kql', isDirectory: () => false, isFile: () => true }
            ] as any);
            mockedFs.readFileSync.mockImplementation(() => {
                throw new Error('Read error');
            });

            const consoleErrorSpy = jest.spyOn(console, 'error');
            const service = new QueriesService(workspacePath);

            // Act
            const queries = service.getAllQueries();

            // Assert
            expect(queries).toEqual([]);
            expect(consoleErrorSpy).toHaveBeenCalled();
        });
    });

    describe('searchQueries', () => {
        beforeEach(() => {
            // Setup multiple queries for search testing
            const query1 = `// Query: Error Logs
// Purpose: Find all error messages
// Use case: Troubleshooting
// Tags: error, logs

traces | where severityLevel == 3`;

            const query2 = `// Query: Performance Analysis
// Purpose: Analyze request duration
// Use case: Performance monitoring
// Tags: performance, duration

requests | summarize avg(duration)`;

            const query3 = `// Query: User Activity
// Purpose: Track user sessions
// Use case: User analytics
// Tags: users, sessions

traces | where customDimensions.userId != ""`;

            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readdirSync.mockReturnValue([
                { name: 'errors.kql', isDirectory: () => false, isFile: () => true },
                { name: 'performance.kql', isDirectory: () => false, isFile: () => true },
                { name: 'users.kql', isDirectory: () => false, isFile: () => true }
            ] as any);
            mockedFs.readFileSync.mockImplementation((filePath: any) => {
                if (filePath.includes('errors.kql')) return query1;
                if (filePath.includes('performance.kql')) return query2;
                if (filePath.includes('users.kql')) return query3;
                return '';
            });
        });

        it('should return all queries when no search terms provided', () => {
            // Arrange
            const service = new QueriesService(workspacePath);

            // Act
            const results = service.searchQueries([]);

            // Assert
            expect(results).toHaveLength(3);
        });

        it('should find queries by name', () => {
            // Arrange
            const service = new QueriesService(workspacePath);

            // Act
            const results = service.searchQueries(['Error']);

            // Assert
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('Error Logs');
        });

        it('should find queries by tag', () => {
            // Arrange
            const service = new QueriesService(workspacePath);

            // Act
            const results = service.searchQueries(['performance']);

            // Assert
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('Performance Analysis');
        });

        it('should find queries by purpose', () => {
            // Arrange
            const service = new QueriesService(workspacePath);

            // Act
            const results = service.searchQueries(['user sessions']);

            // Assert
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('User Activity');
        });

        it('should find queries by use case', () => {
            // Arrange
            const service = new QueriesService(workspacePath);

            // Act
            const results = service.searchQueries(['Troubleshooting']);

            // Assert
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('Error Logs');
        });

        it('should find queries by filename', () => {
            // Arrange
            const service = new QueriesService(workspacePath);

            // Act
            const results = service.searchQueries(['users.kql']);

            // Assert
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('User Activity');
        });

        it('should find queries by KQL content', () => {
            // Arrange
            const service = new QueriesService(workspacePath);

            // Act
            const results = service.searchQueries(['summarize']);

            // Assert
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('Performance Analysis');
        });

        it('should be case-insensitive', () => {
            // Arrange
            const service = new QueriesService(workspacePath);

            // Act
            const results = service.searchQueries(['ERROR', 'LOGS']);

            // Assert
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('Error Logs');
        });

        it('should return multiple matches for broad search terms', () => {
            // Arrange
            const service = new QueriesService(workspacePath);

            // Act
            const results = service.searchQueries(['traces']);

            // Assert
            expect(results.length).toBeGreaterThanOrEqual(2); // errors.kql and users.kql both have 'traces'
        });

        it('should sort results by relevance', () => {
            // Arrange
            const service = new QueriesService(workspacePath);

            // Act - search term that matches name (high score) and KQL content (low score)
            const results = service.searchQueries(['performance']);

            // Assert
            expect(results[0].name).toBe('Performance Analysis'); // Should be first (matches name AND tags)
        });
    });

    describe('saveQuery', () => {
        it('should save query with all metadata', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.writeFileSync.mockReturnValue(undefined);

            const service = new QueriesService(workspacePath);

            const name = 'Test Query';
            const kql = 'traces | take 10';
            const purpose = 'Testing purpose';
            const useCase = 'Testing use case';
            const tags = ['test', 'example'];

            // Act
            const filePath = service.saveQuery(name, kql, purpose, useCase, tags);

            // Assert
            expect(mockedFs.writeFileSync).toHaveBeenCalled();
            const writeCall = mockedFs.writeFileSync.mock.calls[0];
            const writtenContent = writeCall[1] as string;

            expect(writtenContent).toContain('// Query: Test Query');
            expect(writtenContent).toContain('// Purpose: Testing purpose');
            expect(writtenContent).toContain('// Use case: Testing use case');
            expect(writtenContent).toContain('// Tags: test, example');
            expect(writtenContent).toContain('traces | take 10');
            expect(filePath).toContain('Test Query.kql'); // Filename preserves spaces
        });

        it('should save query without optional metadata', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.writeFileSync.mockReturnValue(undefined);

            const service = new QueriesService(workspacePath);

            const name = 'Simple Query';
            const kql = 'traces | take 10';

            // Act
            const filePath = service.saveQuery(name, kql);

            // Assert
            expect(mockedFs.writeFileSync).toHaveBeenCalled();
            const writeCall = mockedFs.writeFileSync.mock.calls[0];
            const writtenContent = writeCall[1] as string;

            expect(writtenContent).toContain('// Query: Simple Query');
            expect(writtenContent).not.toContain('// Purpose:');
            expect(writtenContent).not.toContain('// Use case:');
            expect(writtenContent).not.toContain('// Tags:');
            expect(writtenContent).toContain('traces | take 10');
        });

        it('should generate safe filename from query name', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.writeFileSync.mockReturnValue(undefined);

            const service = new QueriesService(workspacePath);

            // Act
            const filePath1 = service.saveQuery('My Test Query!', 'traces | take 10');
            const filePath2 = service.saveQuery('Query #2 @ 2025', 'traces | take 10');

            // Assert
            // Special chars removed, spaces normalized: "My Test Query!" -> "My Test Query.kql"
            expect(filePath1).toContain('My Test Query.kql');
            expect(filePath2).toContain('Query 2 2025.kql'); // Special chars removed, multiple spaces normalized to single
        });

        it('should include current date in Created field', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.writeFileSync.mockReturnValue(undefined);

            const service = new QueriesService(workspacePath);

            const expectedDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

            // Act
            service.saveQuery('Test', 'traces | take 10');

            // Assert
            const writeCall = mockedFs.writeFileSync.mock.calls[0];
            const writtenContent = writeCall[1] as string;

            expect(writtenContent).toContain(`// Created: ${expectedDate}`);
        });

        it('should handle write errors', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.writeFileSync.mockImplementation(() => {
                throw new Error('Write error');
            });

            const consoleErrorSpy = jest.spyOn(console, 'error');
            const service = new QueriesService(workspacePath);

            // Act & Assert
            expect(() => service.saveQuery('Test', 'traces | take 10')).toThrow('Write error');
            expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to save query:', expect.any(Error));
        });

        it('should save empty tags array when tags not provided', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.writeFileSync.mockReturnValue(undefined);

            const service = new QueriesService(workspacePath);

            // Act
            service.saveQuery('Test', 'traces | take 10', 'purpose', 'useCase', []);

            // Assert
            const writeCall = mockedFs.writeFileSync.mock.calls[0];
            const writtenContent = writeCall[1] as string;

            expect(writtenContent).not.toContain('// Tags:');
        });
    });
});
