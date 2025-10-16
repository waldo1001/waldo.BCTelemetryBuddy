/**
 * Cache Commands Tests
 * Tests for file system-based cache management commands (clear, stats)
 * Added: 2025-10-16 (Prompt #128, #129, #130)
 */

import * as fs from 'fs';
import * as path from 'path';

// Mock vscode module
const mockShowInformationMessage = jest.fn();
const mockShowErrorMessage = jest.fn();
const mockOutputAppendLine = jest.fn();

jest.mock('vscode', () => ({
    window: {
        showInformationMessage: mockShowInformationMessage,
        showErrorMessage: mockShowErrorMessage,
        createOutputChannel: () => ({
            appendLine: mockOutputAppendLine,
            show: jest.fn()
        })
    },
    workspace: {
        getConfiguration: jest.fn(() => ({
            get: jest.fn((key: string, defaultValue: any) => defaultValue)
        })),
        workspaceFolders: [{
            uri: { fsPath: '/test/workspace' }
        }]
    }
}), { virtual: true });

// Mock fs module at the top level
jest.mock('fs');

describe('Cache Commands - File System Operations', () => {
    const testWorkspacePath = '/test/workspace';
    const testCachePath = path.join(testWorkspacePath, '.vscode', '.bctb', 'cache');

    beforeEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    describe('clearCacheCommand', () => {
        it('should handle non-existent cache directory gracefully', () => {
            // Mock fs.existsSync to return false
            jest.spyOn(fs, 'existsSync').mockReturnValue(false);

            // Simulate command execution
            const result = simulateClearCache(testCachePath);

            expect(result.success).toBe(true);
            expect(result.message.toLowerCase()).toContain('cache is empty');
            expect(result.deletedCount).toBe(0);
        });

        it('should delete all .json cache files', () => {
            // Mock fs operations
            jest.spyOn(fs, 'existsSync').mockReturnValue(true);
            jest.spyOn(fs, 'readdirSync').mockReturnValue([
                'query1.json',
                'query2.json',
                'readme.txt', // Should be ignored
                'query3.json'
            ] as any);
            const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => { });

            const result = simulateClearCache(testCachePath);

            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(3); // Only .json files
            expect(unlinkSpy).toHaveBeenCalledTimes(3);
            expect(unlinkSpy).toHaveBeenCalledWith(path.join(testCachePath, 'query1.json'));
            expect(unlinkSpy).toHaveBeenCalledWith(path.join(testCachePath, 'query2.json'));
            expect(unlinkSpy).toHaveBeenCalledWith(path.join(testCachePath, 'query3.json'));
        });

        it('should handle individual file deletion errors gracefully', () => {
            jest.spyOn(fs, 'existsSync').mockReturnValue(true);
            jest.spyOn(fs, 'readdirSync').mockReturnValue(['query1.json', 'query2.json'] as any);

            let callCount = 0;
            jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    throw new Error('Permission denied');
                }
            });

            const result = simulateClearCache(testCachePath);

            // Should continue despite error on first file
            expect(result.deletedCount).toBe(1); // Second file succeeded
            expect(result.errors).toBe(1);
        });

        it('should report correct count of deleted files', () => {
            jest.spyOn(fs, 'existsSync').mockReturnValue(true);
            jest.spyOn(fs, 'readdirSync').mockReturnValue([
                'a.json', 'b.json', 'c.json', 'd.json', 'e.json'
            ] as any);
            jest.spyOn(fs, 'unlinkSync').mockImplementation(() => { });

            const result = simulateClearCache(testCachePath);

            expect(result.deletedCount).toBe(5);
            expect(result.message).toContain('5 entries removed');
        });
    });

    describe('showCacheStatsCommand', () => {
        it('should handle non-existent cache directory', () => {
            jest.spyOn(fs, 'existsSync').mockReturnValue(false);

            const stats = simulateCacheStats(testCachePath);

            expect(stats.totalEntries).toBe(0);
            expect(stats.expiredEntries).toBe(0);
            expect(stats.totalSizeBytes).toBe(0);
            expect(stats.cachePath).toBe(testCachePath);
        });

        it('should calculate total size correctly', () => {
            jest.spyOn(fs, 'existsSync').mockReturnValue(true);
            jest.spyOn(fs, 'readdirSync').mockReturnValue(['query1.json', 'query2.json'] as any);

            jest.spyOn(fs, 'statSync').mockImplementation((filePath) => ({
                size: filePath.toString().includes('query1') ? 1024 : 2048
            } as any));

            jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
                data: {},
                timestamp: Date.now(),
                ttl: 3600
            }));

            const stats = simulateCacheStats(testCachePath);

            expect(stats.totalEntries).toBe(2);
            expect(stats.totalSizeBytes).toBe(3072); // 1024 + 2048
            expect(stats.sizeInKB).toBe('3.00');
            expect(stats.sizeInMB).toBe('0.00');
        });

        it('should identify expired entries correctly', () => {
            jest.spyOn(fs, 'existsSync').mockReturnValue(true);
            jest.spyOn(fs, 'readdirSync').mockReturnValue([
                'fresh.json',
                'expired.json'
            ] as any);

            jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 } as any);

            const now = Date.now();
            jest.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
                if (filePath.toString().includes('fresh')) {
                    return JSON.stringify({
                        data: {},
                        timestamp: now - 1000 * 1000, // 1000 seconds ago
                        ttl: 3600 // Still valid
                    });
                } else {
                    return JSON.stringify({
                        data: {},
                        timestamp: now - 5000 * 1000, // 5000 seconds ago
                        ttl: 3600 // Expired
                    });
                }
            });

            const stats = simulateCacheStats(testCachePath);

            expect(stats.totalEntries).toBe(2);
            expect(stats.expiredEntries).toBe(1);
        });

        it('should format size correctly in KB and MB', () => {
            const testCases = [
                { bytes: 1024, expectedKB: '1.00', expectedMB: '0.00' },
                { bytes: 1024 * 1024, expectedKB: '1024.00', expectedMB: '1.00' },
                { bytes: 1536, expectedKB: '1.50', expectedMB: '0.00' },
                { bytes: 2 * 1024 * 1024 + 512 * 1024, expectedKB: '2560.00', expectedMB: '2.50' }
            ];

            testCases.forEach(({ bytes, expectedKB, expectedMB }) => {
                const formatted = formatCacheSize(bytes);
                expect(formatted.kb).toBe(expectedKB);
                expect(formatted.mb).toBe(expectedMB);
            });
        });

        it('should handle malformed cache entries gracefully', () => {
            jest.spyOn(fs, 'existsSync').mockReturnValue(true);
            jest.spyOn(fs, 'readdirSync').mockReturnValue([
                'valid.json',
                'malformed.json'
            ] as any);

            jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 } as any);

            jest.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
                if (filePath.toString().includes('valid')) {
                    return JSON.stringify({
                        data: {},
                        timestamp: Date.now(),
                        ttl: 3600
                    });
                } else {
                    return '{ invalid json }';
                }
            });

            const stats = simulateCacheStats(testCachePath);

            // Should count valid entry, skip malformed
            expect(stats.totalEntries).toBe(2); // Still counted as file
            expect(stats.errors).toBe(1); // But marked as error
        });

        it('should calculate expiration correctly with custom TTL', () => {
            const customTTL = 7200; // 2 hours (7200 seconds)
            const now = Date.now();

            const cacheEntry = {
                data: {},
                timestamp: now - 10000 * 1000, // 10000 seconds ago (more than TTL)
                ttl: customTTL
            };

            const age = (now - cacheEntry.timestamp) / 1000;
            const isExpired = age > cacheEntry.ttl;

            expect(isExpired).toBe(true);
            expect(age).toBeGreaterThan(customTTL);
        });
    });
});

// Helper functions simulating command logic
function simulateClearCache(cachePath: string): { success: boolean; message: string; deletedCount: number; errors: number } {
    try {
        if (!fs.existsSync(cachePath)) {
            return {
                success: true,
                message: 'Cache is empty (cache directory does not exist)',
                deletedCount: 0,
                errors: 0
            };
        }

        const files = fs.readdirSync(cachePath);
        const cacheFiles = files.filter((f: string) => f.endsWith('.json'));

        let deletedCount = 0;
        let errors = 0;

        for (const file of cacheFiles) {
            try {
                fs.unlinkSync(path.join(cachePath, file));
                deletedCount++;
            } catch (err) {
                errors++;
            }
        }

        return {
            success: true,
            message: `Cache cleared successfully (${deletedCount} entries removed)`,
            deletedCount,
            errors
        };
    } catch (err: any) {
        return {
            success: false,
            message: err.message,
            deletedCount: 0,
            errors: 1
        };
    }
}

function simulateCacheStats(cachePath: string): {
    totalEntries: number;
    expiredEntries: number;
    totalSizeBytes: number;
    cachePath: string;
    sizeInKB: string;
    sizeInMB: string;
    errors: number;
} {
    try {
        if (!fs.existsSync(cachePath)) {
            return {
                totalEntries: 0,
                expiredEntries: 0,
                totalSizeBytes: 0,
                cachePath,
                sizeInKB: '0.00',
                sizeInMB: '0.00',
                errors: 0
            };
        }

        const files = fs.readdirSync(cachePath);
        const cacheFiles = files.filter((f: string) => f.endsWith('.json'));

        let totalEntries = 0;
        let expiredEntries = 0;
        let totalSizeBytes = 0;
        let errors = 0;
        const now = Date.now();

        for (const file of cacheFiles) {
            try {
                const filePath = path.join(cachePath, file);
                const stats = fs.statSync(filePath);
                totalSizeBytes += stats.size;
                totalEntries++;

                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const entry = JSON.parse(fileContent);

                const age = (now - entry.timestamp) / 1000;
                if (age > (entry.ttl || 3600)) {
                    expiredEntries++;
                }
            } catch (err) {
                errors++;
            }
        }

        const { kb, mb } = formatCacheSize(totalSizeBytes);

        return {
            totalEntries,
            expiredEntries,
            totalSizeBytes,
            cachePath,
            sizeInKB: kb,
            sizeInMB: mb,
            errors
        };
    } catch (err) {
        return {
            totalEntries: 0,
            expiredEntries: 0,
            totalSizeBytes: 0,
            cachePath,
            sizeInKB: '0.00',
            sizeInMB: '0.00',
            errors: 1
        };
    }
}

function formatCacheSize(bytes: number): { kb: string; mb: string } {
    const kb = (bytes / 1024).toFixed(2);
    const mb = (bytes / (1024 * 1024)).toFixed(2);
    return { kb, mb };
}
