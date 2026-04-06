import { ExportService, convertToCsv } from '../exports.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('convertToCsv', () => {
    it('should convert columns and rows to CSV string', () => {
        const columns = ['name', 'age', 'city'];
        const rows = [
            ['Alice', 30, 'New York'],
            ['Bob', 25, 'London']
        ];

        const result = convertToCsv(columns, rows);

        expect(result).toBe('name,age,city\nAlice,30,New York\nBob,25,London');
    });

    it('should escape values containing commas', () => {
        const columns = ['name', 'address'];
        const rows = [['Alice', '123 Main St, Apt 4']];

        const result = convertToCsv(columns, rows);

        expect(result).toBe('name,address\nAlice,"123 Main St, Apt 4"');
    });

    it('should escape values containing double quotes', () => {
        const columns = ['name', 'description'];
        const rows = [['Alice', 'Said "hello"']];

        const result = convertToCsv(columns, rows);

        expect(result).toBe('name,description\nAlice,"Said ""hello"""');
    });

    it('should escape values containing newlines', () => {
        const columns = ['name', 'note'];
        const rows = [['Alice', 'Line 1\nLine 2']];

        const result = convertToCsv(columns, rows);

        expect(result).toBe('name,note\nAlice,"Line 1\nLine 2"');
    });

    it('should handle null and undefined values', () => {
        const columns = ['a', 'b', 'c'];
        const rows = [[null, undefined, 'value']];

        const result = convertToCsv(columns, rows);

        expect(result).toBe('a,b,c\n,,value');
    });

    it('should handle object values by JSON stringifying', () => {
        const columns = ['name', 'data'];
        const rows = [['Alice', { key: 'val' }]];

        const result = convertToCsv(columns, rows);

        expect(result).toBe('name,data\nAlice,"{""key"":""val""}"');
    });

    it('should handle empty rows', () => {
        const columns = ['a', 'b'];
        const rows: any[][] = [];

        const result = convertToCsv(columns, rows);

        expect(result).toBe('a,b');
    });
});

describe('ExportService', () => {
    const workspacePath = '/test/workspace';
    const exportsDir = path.join(workspacePath, '.vscode', '.bctb', 'exports');

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('getExportsDir', () => {
        it('should return the exports directory path', () => {
            const service = new ExportService(workspacePath);
            expect(service.getExportsDir()).toBe(exportsDir);
        });
    });

    describe('exportJson', () => {
        it('should write JSON data to a file and return file info', () => {
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.writeFileSync.mockReturnValue(undefined);

            const service = new ExportService(workspacePath);
            const data = { type: 'table', columns: ['a'], rows: [['b']] };
            const result = service.exportJson(data, 'query_telemetry');

            expect(result.filePath).toMatch(/query_telemetry_.*\.json$/);
            expect(result.fileUri).toMatch(/^file:\/\//);
            expect(result.mimeType).toBe('application/json');
            expect(result.filename).toMatch(/query_telemetry_.*\.json$/);
            expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
                result.filePath,
                JSON.stringify(data, null, 2),
                'utf-8'
            );
        });

        it('should create exports directory if it does not exist', () => {
            mockedFs.existsSync.mockReturnValue(false);
            mockedFs.mkdirSync.mockReturnValue(undefined);
            mockedFs.writeFileSync.mockReturnValue(undefined);

            const service = new ExportService(workspacePath);
            service.exportJson({ test: true }, 'test_tool');

            expect(mockedFs.mkdirSync).toHaveBeenCalledWith(exportsDir, { recursive: true });
        });
    });

    describe('exportCsv', () => {
        it('should write CSV data to a file and return file info', () => {
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.writeFileSync.mockReturnValue(undefined);

            const service = new ExportService(workspacePath);
            const columns = ['name', 'value'];
            const rows = [['test', 42]];
            const result = service.exportCsv(columns, rows, 'query_telemetry');

            expect(result.filePath).toMatch(/query_telemetry_.*\.csv$/);
            expect(result.fileUri).toMatch(/^file:\/\//);
            expect(result.mimeType).toBe('text/csv');
            expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
                result.filePath,
                'name,value\ntest,42',
                'utf-8'
            );
        });
    });

    describe('listExports', () => {
        it('should return empty array when exports dir does not exist', () => {
            mockedFs.existsSync.mockReturnValue(false);

            const service = new ExportService(workspacePath);
            const result = service.listExports();

            expect(result).toEqual([]);
        });

        it('should list JSON and CSV files', () => {
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readdirSync.mockReturnValue([
                'query_telemetry_20260406_120000_abcd1234.csv',
                'query_telemetry_20260406_120100_efgh5678.json',
                'other.txt'
            ] as any);
            mockedFs.statSync.mockReturnValue({
                birthtime: new Date('2026-04-06T12:00:00Z'),
                birthtimeMs: new Date('2026-04-06T12:00:00Z').getTime(),
                size: 1024
            } as any);

            const service = new ExportService(workspacePath);
            const result = service.listExports();

            expect(result).toHaveLength(2);
            expect(result[0].mimeType).toMatch(/text\/csv|application\/json/);
            expect(result[1].mimeType).toMatch(/text\/csv|application\/json/);
        });
    });

    describe('readExport', () => {
        it('should return file content and mimeType', () => {
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readFileSync.mockReturnValue('name,value\ntest,42');

            const service = new ExportService(workspacePath);
            const result = service.readExport('test.csv');

            expect(result).toEqual({
                content: 'name,value\ntest,42',
                mimeType: 'text/csv'
            });
        });

        it('should return null for non-existent file', () => {
            mockedFs.existsSync.mockReturnValue(false);

            const service = new ExportService(workspacePath);
            const result = service.readExport('missing.csv');

            expect(result).toBeNull();
        });

        it('should prevent path traversal', () => {
            const service = new ExportService(workspacePath);
            const result = service.readExport('../../../etc/passwd');

            expect(result).toBeNull();
        });
    });

    describe('cleanupExpired', () => {
        it('should return 0 when exports dir does not exist', () => {
            mockedFs.existsSync.mockReturnValue(false);

            const service = new ExportService(workspacePath);
            const result = service.cleanupExpired();

            expect(result).toBe(0);
        });

        it('should delete expired files', () => {
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readdirSync.mockReturnValue([
                'old_file.csv',
                'new_file.json'
            ] as any);

            const now = Date.now();
            const oldTime = now - 25 * 60 * 60 * 1000; // 25 hours ago
            const newTime = now - 1 * 60 * 60 * 1000;  // 1 hour ago

            let callCount = 0;
            mockedFs.statSync.mockImplementation(() => {
                callCount++;
                return {
                    birthtimeMs: callCount === 1 ? oldTime : newTime
                } as any;
            });
            mockedFs.unlinkSync.mockReturnValue(undefined);

            const service = new ExportService(workspacePath);
            const result = service.cleanupExpired();

            expect(result).toBe(1);
            expect(mockedFs.unlinkSync).toHaveBeenCalledTimes(1);
        });
    });
});
