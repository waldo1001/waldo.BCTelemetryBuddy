import { CacheService } from '../cache.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('CacheService', () => {
    const workspacePath = '/test/workspace';
    const cacheDir = path.join(workspacePath, '.vscode', '.bctb', 'cache');
    const ttlSeconds = 3600;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should create cache directory when enabled', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(false);
            mockedFs.mkdirSync.mockReturnValue(undefined);

            // Act
            new CacheService(workspacePath, ttlSeconds, true);

            // Assert
            expect(mockedFs.existsSync).toHaveBeenCalledWith(cacheDir);
            expect(mockedFs.mkdirSync).toHaveBeenCalledWith(cacheDir, { recursive: true });
        });

        it('should not create cache directory when disabled', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(false);

            // Act
            new CacheService(workspacePath, ttlSeconds, false);

            // Assert
            expect(mockedFs.existsSync).not.toHaveBeenCalled();
            expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
        });

        it('should not create cache directory if it already exists', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);

            // Act
            new CacheService(workspacePath, ttlSeconds, true);

            // Assert
            expect(mockedFs.existsSync).toHaveBeenCalledWith(cacheDir);
            expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
        });

        it('should handle errors when creating cache directory', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(false);
            mockedFs.mkdirSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });

            const consoleErrorSpy = jest.spyOn(console, 'error');

            // Act
            new CacheService(workspacePath, ttlSeconds, true);

            // Assert
            expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to create cache directory:', expect.any(Error));
        });
    });

    describe('get', () => {
        it('should return null when cache is disabled', () => {
            // Arrange
            const service = new CacheService(workspacePath, ttlSeconds, false);

            // Act
            const result = service.get<any>('test query');

            // Assert
            expect(result).toBeNull();
            expect(mockedFs.existsSync).not.toHaveBeenCalled();
        });

        it('should return null when cache file does not exist', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(false);
            const service = new CacheService(workspacePath, ttlSeconds, true);

            // Act
            const result = service.get<any>('test query');

            // Assert
            expect(result).toBeNull();
        });

        it('should return cached data when not expired', () => {
            // Arrange
            const mockData = { columns: ['col1'], rows: [['value1']] };
            const cacheEntry = {
                data: mockData,
                timestamp: Date.now() - 1000, // 1 second ago
                ttl: 3600
            };

            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readFileSync.mockReturnValue(JSON.stringify(cacheEntry));

            const service = new CacheService(workspacePath, ttlSeconds, true);

            // Act
            const result = service.get<typeof mockData>('test query');

            // Assert
            expect(result).toEqual(mockData);
        });

        it('should return null and delete cache when expired', () => {
            // Arrange
            const mockData = { columns: ['col1'], rows: [['value1']] };
            const cacheEntry = {
                data: mockData,
                timestamp: Date.now() - 7200000, // 2 hours ago
                ttl: 3600 // 1 hour TTL
            };

            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readFileSync.mockReturnValue(JSON.stringify(cacheEntry));
            mockedFs.unlinkSync.mockReturnValue(undefined);

            const service = new CacheService(workspacePath, ttlSeconds, true);

            // Act
            const result = service.get<typeof mockData>('test query');

            // Assert
            expect(result).toBeNull();
            expect(mockedFs.unlinkSync).toHaveBeenCalled();
        });

        it('should handle errors reading cache file', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readFileSync.mockImplementation(() => {
                throw new Error('Read error');
            });

            const consoleErrorSpy = jest.spyOn(console, 'error');
            const service = new CacheService(workspacePath, ttlSeconds, true);

            // Act
            const result = service.get<any>('test query');

            // Assert
            expect(result).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to read cache for key'),
                expect.any(Error)
            );
        });

        it('should handle invalid JSON in cache file', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readFileSync.mockReturnValue('invalid json{{{');

            const consoleErrorSpy = jest.spyOn(console, 'error');
            const service = new CacheService(workspacePath, ttlSeconds, true);

            // Act
            const result = service.get<any>('test query');

            // Assert
            expect(result).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalled();
        });
    });

    describe('set', () => {
        it('should not write cache when disabled', () => {
            // Arrange
            const service = new CacheService(workspacePath, ttlSeconds, false);

            // Act
            service.set('test query', { data: 'test' });

            // Assert
            expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
        });

        it('should write cache with default TTL', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.writeFileSync.mockReturnValue(undefined);

            const service = new CacheService(workspacePath, ttlSeconds, true);
            const testData = { columns: ['col1'], rows: [['value1']] };

            // Act
            service.set('test query', testData);

            // Assert
            expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining('.json'),
                expect.stringContaining('"data"'),
                'utf-8'
            );
        });

        it('should write cache with custom TTL', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.writeFileSync.mockReturnValue(undefined);

            const service = new CacheService(workspacePath, ttlSeconds, true);
            const testData = { columns: ['col1'], rows: [['value1']] };
            const customTTL = 7200;

            // Act
            service.set('test query', testData, customTTL);

            // Assert
            const writeCall = mockedFs.writeFileSync.mock.calls[0];
            const writtenContent = JSON.parse(writeCall[1] as string);
            expect(writtenContent.ttl).toBe(customTTL);
        });

        it('should handle errors writing cache file', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.writeFileSync.mockImplementation(() => {
                throw new Error('Write error');
            });

            const consoleErrorSpy = jest.spyOn(console, 'error');
            const service = new CacheService(workspacePath, ttlSeconds, true);

            // Act
            service.set('test query', { data: 'test' });

            // Assert
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to write cache for key'),
                expect.any(Error)
            );
        });

        it('should generate consistent cache keys for same query', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.writeFileSync.mockReturnValue(undefined);

            const service = new CacheService(workspacePath, ttlSeconds, true);

            // Act
            service.set('test query', { data: 'test1' });
            const firstCallPath = mockedFs.writeFileSync.mock.calls[0][0];

            service.set('test query', { data: 'test2' });
            const secondCallPath = mockedFs.writeFileSync.mock.calls[1][0];

            // Assert
            expect(firstCallPath).toBe(secondCallPath);
        });

        it('should generate different cache keys for different queries', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.writeFileSync.mockReturnValue(undefined);

            const service = new CacheService(workspacePath, ttlSeconds, true);

            // Act
            service.set('query 1', { data: 'test1' });
            const firstCallPath = mockedFs.writeFileSync.mock.calls[0][0];

            service.set('query 2', { data: 'test2' });
            const secondCallPath = mockedFs.writeFileSync.mock.calls[1][0];

            // Assert
            expect(firstCallPath).not.toBe(secondCallPath);
        });
    });

    describe('delete', () => {
        it('should not delete cache when disabled', () => {
            // Arrange
            const service = new CacheService(workspacePath, ttlSeconds, false);

            // Act
            service.delete('test query');

            // Assert
            expect(mockedFs.existsSync).not.toHaveBeenCalled();
            expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
        });

        it('should delete cache file if exists', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.unlinkSync.mockReturnValue(undefined);

            const service = new CacheService(workspacePath, ttlSeconds, true);

            // Act
            service.delete('test query');

            // Assert
            expect(mockedFs.unlinkSync).toHaveBeenCalled();
        });

        it('should not throw error if cache file does not exist', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(false);

            const service = new CacheService(workspacePath, ttlSeconds, true);

            // Act & Assert
            expect(() => service.delete('test query')).not.toThrow();
            expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
        });

        it('should handle errors deleting cache file', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.unlinkSync.mockImplementation(() => {
                throw new Error('Delete error');
            });

            const consoleErrorSpy = jest.spyOn(console, 'error');
            const service = new CacheService(workspacePath, ttlSeconds, true);

            // Act
            service.delete('test query');

            // Assert
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to delete cache for key'),
                expect.any(Error)
            );
        });
    });

    describe('clear', () => {
        it('should not clear cache when disabled', () => {
            // Arrange
            const service = new CacheService(workspacePath, ttlSeconds, false);

            // Act
            service.clear();

            // Assert
            expect(mockedFs.readdirSync).not.toHaveBeenCalled();
        });

        it('should delete all .json files in cache directory', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readdirSync.mockReturnValue(['file1.json', 'file2.json', 'readme.txt'] as any);
            mockedFs.unlinkSync.mockReturnValue(undefined);

            const service = new CacheService(workspacePath, ttlSeconds, true);

            // Act
            service.clear();

            // Assert
            expect(mockedFs.unlinkSync).toHaveBeenCalledTimes(2); // Only deletes .json files
            expect(mockedFs.unlinkSync).toHaveBeenCalledWith(path.join(cacheDir, 'file1.json'));
            expect(mockedFs.unlinkSync).toHaveBeenCalledWith(path.join(cacheDir, 'file2.json'));
        });

        it('should handle errors clearing cache', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readdirSync.mockImplementation(() => {
                throw new Error('Read dir error');
            });

            const consoleErrorSpy = jest.spyOn(console, 'error');
            const service = new CacheService(workspacePath, ttlSeconds, true);

            // Act
            service.clear();

            // Assert
            expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to clear cache:', expect.any(Error));
        });
    });

    describe('cleanupExpired', () => {
        it('should not cleanup when disabled', () => {
            // Arrange
            const service = new CacheService(workspacePath, ttlSeconds, false);

            // Act
            service.cleanupExpired();

            // Assert
            expect(mockedFs.readdirSync).not.toHaveBeenCalled();
        });

        it('should delete expired cache files', () => {
            // Arrange
            const expiredEntry = {
                data: { test: 'data' },
                timestamp: Date.now() - 7200000, // 2 hours ago
                ttl: 3600 // 1 hour TTL
            };

            const validEntry = {
                data: { test: 'data' },
                timestamp: Date.now() - 1000, // 1 second ago
                ttl: 3600
            };

            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readdirSync.mockReturnValue(['expired.json', 'valid.json'] as any);
            mockedFs.readFileSync.mockImplementation((filePath: any) => {
                if (filePath.includes('expired.json')) {
                    return JSON.stringify(expiredEntry);
                } else {
                    return JSON.stringify(validEntry);
                }
            });
            mockedFs.unlinkSync.mockReturnValue(undefined);

            const service = new CacheService(workspacePath, ttlSeconds, true);

            // Act
            service.cleanupExpired();

            // Assert
            expect(mockedFs.unlinkSync).toHaveBeenCalledTimes(1);
            expect(mockedFs.unlinkSync).toHaveBeenCalledWith(path.join(cacheDir, 'expired.json'));
        });

        it('should handle errors during cleanup', () => {
            // Arrange
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readdirSync.mockReturnValue(['file1.json'] as any);
            mockedFs.readFileSync.mockImplementation(() => {
                throw new Error('Read error');
            });

            const consoleErrorSpy = jest.spyOn(console, 'error');
            const service = new CacheService(workspacePath, ttlSeconds, true);

            // Act
            service.cleanupExpired();

            // Assert
            expect(consoleErrorSpy).toHaveBeenCalled();
        });
    });
});
