import {
    lookupEventCategory,
    lookupEventCategories,
    clearEventCache,
    EventCategoryInfo
} from '../eventLookup';
import * as fs from 'fs';
import * as path from 'path';

describe('Event Lookup Module', () => {
    const cacheDir = path.join(process.cwd(), '.cache', 'events');

    // Helper to clear all cache files
    const clearCache = () => {
        if (fs.existsSync(cacheDir)) {
            const files = fs.readdirSync(cacheDir);
            files.forEach(file => {
                fs.unlinkSync(path.join(cacheDir, file));
            });
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        clearCache();
    });

    afterAll(() => {
        clearCache();
    });

    describe('Cache Functionality', () => {
        it('should return cached result if not expired', async () => {
            // Create a cache entry that expires in the future
            const eventId = 'RT0006';
            const cacheData: EventCategoryInfo = {
                eventId,
                category: 'Performance',
                subcategory: 'Runtime',
                documentationUrl: 'https://learn.microsoft.com/test',
                description: 'Test event',
                isStandardEvent: true,
                source: 'microsoft-learn' // Will be changed to 'cache' when loaded
            };

            const cacheEntry = {
                data: cacheData,
                expiresAt: Date.now() + (23 * 60 * 60 * 1000) // Expires in 23 hours
            };

            // Ensure cache directory exists
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }

            const cacheFile = path.join(cacheDir, `${eventId}.json`);
            fs.writeFileSync(cacheFile, JSON.stringify(cacheEntry), 'utf-8');

            const result = await lookupEventCategory(eventId);

            expect(result.category).toBe('Performance');
            expect(result.source).toBe('cache');
            expect(result.isStandardEvent).toBe(true);
        });

        it('should respect 24-hour cache TTL', async () => {
            const eventId = 'RT0010';

            const cacheData: EventCategoryInfo = {
                eventId,
                category: 'Performance',
                documentationUrl: null,
                description: 'Test',
                isStandardEvent: true,
                source: 'microsoft-learn'
            };

            const cacheEntry = {
                data: cacheData,
                expiresAt: Date.now() + (23 * 60 * 60 * 1000) // Expires in 23 hours (still valid)
            };

            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }

            fs.writeFileSync(
                path.join(cacheDir, `${eventId}.json`),
                JSON.stringify(cacheEntry)
            );

            const result = await lookupEventCategory(eventId);

            expect(result.source).toBe('cache');
        });

        it('should reject expired cache (>24 hours old)', async () => {
            const eventId = 'RT0005_EXPIRED';

            const cacheData: EventCategoryInfo = {
                eventId,
                category: 'Old Category',
                documentationUrl: null,
                description: 'Old description',
                isStandardEvent: true,
                source: 'microsoft-learn'
            };

            const cacheEntry = {
                data: cacheData,
                expiresAt: Date.now() - (1 * 60 * 60 * 1000) // Expired 1 hour ago
            };

            // Ensure cache directory exists
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }

            const cacheFile = path.join(cacheDir, `${eventId}.json`);
            fs.writeFileSync(cacheFile, JSON.stringify(cacheEntry), 'utf-8');

            const result = await lookupEventCategory(eventId);

            // Should not use expired cache - will either fetch from Microsoft Learn or use custom analysis
            expect(result.source).not.toBe('cache');
            // For unknown event IDs, it may fall back to custom-analysis
            expect(['microsoft-learn', 'custom-analysis']).toContain(result.source);
        }, 10000); // 10s timeout for network call
    });

    describe('Custom Event Analysis', () => {
        it('should detect report-related custom events', async () => {
            const eventId = 'CUSTOM_REPORT_001';
            const customDimensions = {
                reportId: '50100',
                reportName: 'Sales Invoice',
                renderingTime: 1234
            };

            const result = await lookupEventCategory(eventId, customDimensions);

            expect(result.isStandardEvent).toBe(false);
            expect(result.category).toContain('Report');
        }, 10000);

        it('should detect database-related custom events', async () => {
            const eventId = 'CUSTOM_DB_001';
            const customDimensions = {
                sqlStatement: 'SELECT * FROM Customer',
                tableName: 'Sales Header',
                queryDuration: 500
            };

            const result = await lookupEventCategory(eventId, customDimensions);

            expect(result.category).toContain('Database');
        }, 10000);

        it('should detect authentication-related custom events', async () => {
            const eventId = 'CUSTOM_AUTH_001';
            const customDimensions = {
                authToken: 'abc123',
                userId: 'user@example.com',
                loginAttempt: 5
            };

            const result = await lookupEventCategory(eventId, customDimensions);

            expect(result.isStandardEvent).toBe(false);
            expect(result.category).toContain('Authentication');
        }, 10000);

        it('should detect extension-related events', async () => {
            const eventId = 'CUSTOM_EXT_001';
            const customDimensions = {
                extensionName: 'My Extension',
                extensionPublisher: 'Contoso'
            };

            const result = await lookupEventCategory(eventId, customDimensions);

            expect(result.category).toContain('Extension');
        }, 10000);

        it('should detect web service events', async () => {
            const eventId = 'CUSTOM_WS_001';
            const customDimensions = {
                webServiceName: 'Customer API',
                endpoint: '/api/customers'
            };

            const result = await lookupEventCategory(eventId, customDimensions);

            expect(result.category).toContain('Web Service');
        }, 10000);

        it('should use generic category for unmatched patterns', async () => {
            const eventId = 'CUSTOM_UNKNOWN_001';
            const customDimensions = {
                someField: 'someValue',
                anotherField: 123
            };

            const result = await lookupEventCategory(eventId, customDimensions);

            expect(result.category).toContain('Custom event'); // Lowercase 'e'
        }, 10000);
    });

    describe('Message-Based Custom Event Analysis', () => {
        it('should use message field to categorize when available', async () => {
            const eventId = 'CUSTOM_MSG_001';
            const message = 'Performance warning: SQL query execution took 5.2 seconds on table Customer';

            const result = await lookupEventCategory(eventId, undefined, message);

            expect(result.isStandardEvent).toBe(false);
            expect(result.category).toContain('Database');
            expect(result.description).toContain('SQL query');
        }, 10000);

        it('should prioritize message over customDimensions for categorization', async () => {
            const eventId = 'CUSTOM_PRIORITY_001';
            const message = 'Report rendering completed successfully in 2.3 seconds';
            const customDimensions = {
                sqlQuery: 'SELECT * FROM Items', // Database-related field
                executionTime: 2300
            };

            // Message says "report", customDimensions has SQL - message should win
            const result = await lookupEventCategory(eventId, customDimensions, message);

            expect(result.isStandardEvent).toBe(false);
            expect(result.category).toContain('Report'); // Should detect from message, not SQL field
        }, 10000);

        it('should extract description from message field', async () => {
            const eventId = 'CUSTOM_DESC_001';
            const message = 'Custom authentication event: User login failed after 3 attempts';

            const result = await lookupEventCategory(eventId, undefined, message);

            expect(result.description).toBe(message); // Should use full message as description
            expect(result.category).toContain('Authentication');
        }, 10000);

        it('should detect performance-related events from message', async () => {
            const eventId = 'CUSTOM_PERF_001';
            const message = 'Performance degradation detected: Operation latency exceeded 10 seconds';

            const result = await lookupEventCategory(eventId, undefined, message);

            expect(result.category).toContain('Performance');
        }, 10000);

        it('should detect error/exception events from message', async () => {
            const eventId = 'CUSTOM_ERROR_001';
            const message = 'Exception occurred: Division by zero in calculation routine';

            const result = await lookupEventCategory(eventId, undefined, message);

            expect(result.category).toContain('Error');
        }, 10000);

        it('should detect lifecycle events from message', async () => {
            const eventId = 'CUSTOM_LIFECYCLE_001';
            const message = 'Service initialization completed successfully';

            const result = await lookupEventCategory(eventId, undefined, message);

            expect(result.category).toContain('Lifecycle');
        }, 10000);
    });

    describe('lookupEventCategories (bulk)', () => {
        it('should handle empty array', async () => {
            const results = await lookupEventCategories([]);
            expect(results.size).toBe(0);
        });

        it('should lookup multiple events', async () => {
            const eventIds = ['CUSTOM_001', 'CUSTOM_002'];

            const results = await lookupEventCategories(eventIds);

            expect(results.size).toBe(2);
            expect(results.get('CUSTOM_001')?.eventId).toBe('CUSTOM_001');
            expect(results.get('CUSTOM_002')?.eventId).toBe('CUSTOM_002');
        }, 20000); // Longer timeout for multiple network calls
    });

    describe('clearEventCache', () => {
        it('should clear all cache files', () => {
            // Create some cache files
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }

            const cacheData: EventCategoryInfo = {
                eventId: 'RT0005',
                category: 'Test',
                documentationUrl: null,
                description: 'Test',
                isStandardEvent: true,
                source: 'microsoft-learn'
            };

            const cacheEntry = {
                data: cacheData,
                expiresAt: Date.now() + (24 * 60 * 60 * 1000)
            };

            fs.writeFileSync(path.join(cacheDir, 'RT0005.json'), JSON.stringify(cacheEntry));
            fs.writeFileSync(path.join(cacheDir, 'RT0006.json'), JSON.stringify(cacheEntry));

            expect(fs.readdirSync(cacheDir)).toHaveLength(2);

            const cleared = clearEventCache();

            expect(cleared).toBe(2);
            expect(fs.readdirSync(cacheDir)).toHaveLength(0);
        });

        it('should handle non-existent cache directory', () => {
            // Ensure cache dir doesn't exist
            if (fs.existsSync(cacheDir)) {
                fs.rmSync(cacheDir, { recursive: true });
            }

            expect(() => clearEventCache()).not.toThrow();
        });
    });

    describe('Standard Event Lookup', () => {
        it('should lookup standard RT event from Microsoft Learn', async () => {
            // Use a well-known standard event
            const eventId = 'RT0005'; // Long Running SQL Query
            const result = await lookupEventCategory(eventId);

            expect(result.eventId).toBe(eventId);
            // RT0005 is either a standard event or will be categorized as custom if not found
            // Should have fetched from Microsoft Learn or analyzed as custom
            expect(['microsoft-learn', 'cache', 'custom-analysis']).toContain(result.source);

            // Should save to cache after fetch
            const cacheFile = path.join(cacheDir, `${eventId}.json`);
            expect(fs.existsSync(cacheFile)).toBe(true);
        }, 10000);

        it('should return category info with documentation URL for standard events found on Microsoft Learn', async () => {
            const eventId = 'LC0001'; // Company Lifecycle
            const result = await lookupEventCategory(eventId);

            expect(result.eventId).toBe(eventId);
            // If found on Microsoft Learn, should have documentation URL and be marked as standard
            if (result.source === 'microsoft-learn') {
                expect(result.documentationUrl).toBeTruthy();
                expect(result.category).toBeTruthy();
                expect(result.isStandardEvent).toBe(true);
            }
            // If not found, should fall back to custom analysis
            else {
                expect(result.source).toBe('custom-analysis');
                expect(result.isStandardEvent).toBe(false);
            }
        }, 10000);
    });
});
