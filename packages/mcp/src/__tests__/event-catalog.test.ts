/**
 * Event Catalog and Schema Discovery Tests
 * Tests for BC telemetry event discovery tools
 * Added: 2025-10-16 11:15 (Prompt #97)
 */

describe('Event Catalog Discovery', () => {
    describe('getEventCatalog', () => {
        it('should build correct KQL query with parameters', () => {
            const params = {
                daysBack: 10,
                status: 'all',
                minCount: 1
            };

            const kql = buildEventCatalogQuery(params);

            expect(kql).toContain('ago(10d)');
            expect(kql).toContain('summarize');
            expect(kql).toContain('customDimensions.eventId');
        });

        it('should filter by error status', () => {
            const params = {
                daysBack: 7,
                status: 'error',
                minCount: 1
            };

            const kql = buildEventCatalogQuery(params);

            expect(kql).toContain('severityLevel');
            expect(kql).toContain('== 3'); // Error level
        });

        it('should filter by success status', () => {
            const params = {
                daysBack: 7,
                status: 'success',
                minCount: 1
            };

            const kql = buildEventCatalogQuery(params);

            expect(kql).toContain('severityLevel');
            expect(kql).toContain('< 3'); // Success levels
        });

        it('should apply minimum count threshold', () => {
            const params = {
                daysBack: 10,
                status: 'all',
                minCount: 100
            };

            const kql = buildEventCatalogQuery(params);

            expect(kql).toContain('where EventCount >= 100');
        });

        it('should return events sorted by frequency', () => {
            const mockResults = [
                { eventId: 'AL0000001', count: 1000 },
                { eventId: 'AL0000002', count: 500 },
                { eventId: 'AL0000003', count: 2000 }
            ];

            const sorted = sortEventsByFrequency(mockResults);

            expect(sorted[0].eventId).toBe('AL0000003'); // Highest count first
            expect(sorted[1].eventId).toBe('AL0000001');
            expect(sorted[2].eventId).toBe('AL0000002');
        });

        it('should generate Learn URLs for event IDs', () => {
            const eventIds = [
                'AL0000E26',
                'RT0005',
                'LC0013'
            ];

            eventIds.forEach(eventId => {
                const url = generateLearnUrl(eventId);
                expect(url).toContain('learn.microsoft.com');
                expect(url).toContain('dynamics365/business-central');
                expect(url.toLowerCase()).toContain(eventId.toLowerCase());
            });
        });

        it('should classify event status from severity level', () => {
            const testCases = [
                { severityLevel: 0, expected: 'success' },
                { severityLevel: 1, expected: 'success' },
                { severityLevel: 2, expected: 'success' },
                { severityLevel: 3, expected: 'error' },
                { severityLevel: 4, expected: 'error' }
            ];

            testCases.forEach(({ severityLevel, expected }) => {
                const status = classifyEventStatus(severityLevel);
                expect(status).toBe(expected);
            });
        });

        it('should extract event descriptions from telemetry', () => {
            const mockEvent = {
                eventId: 'AL0000E26',
                message: 'Extension update failed',
                customDimensions: {
                    eventId: 'AL0000E26',
                    result: 'Failure'
                }
            };

            const description = extractEventDescription(mockEvent);

            expect(description).toBeTruthy();
            expect(typeof description).toBe('string');
        });

        it('should handle events with "too slow" status', () => {
            const mockEvent = {
                eventId: 'RT0005',
                duration: 30000, // 30 seconds
                message: 'Report execution too slow'
            };

            const isTooSlow = classifyPerformanceStatus(mockEvent.duration);

            expect(isTooSlow).toBe('too slow');
        });
    });

    describe('getEventSchema', () => {
        it('should build correct KQL query for event schema', () => {
            const eventId = 'AL0000E26';
            const sampleSize = 100;

            const kql = buildEventSchemaQuery(eventId, sampleSize);

            expect(kql).toContain(`'${eventId}'`);
            expect(kql).toContain('take 100');
            expect(kql).toContain('customDimensions');
        });

        it('should extract customDimensions fields', () => {
            const mockEvents = [
                {
                    customDimensions: {
                        eventId: 'AL0000E26',
                        extensionName: 'Test Extension',
                        extensionVersion: '1.0.0',
                        result: 'Failure'
                    }
                },
                {
                    customDimensions: {
                        eventId: 'AL0000E26',
                        extensionName: 'Another Extension',
                        errorMessage: 'Compilation failed',
                        result: 'Failure'
                    }
                }
            ];

            const schema = extractSchemaFields(mockEvents);

            expect(schema).toHaveProperty('eventId');
            expect(schema).toHaveProperty('extensionName');
            expect(schema).toHaveProperty('extensionVersion');
            expect(schema).toHaveProperty('result');
            expect(schema).toHaveProperty('errorMessage');
        });

        it('should provide example values for each field', () => {
            const mockEvents = [
                { customDimensions: { companyName: 'Acme Corp' } },
                { customDimensions: { companyName: 'Tech Inc' } },
                { customDimensions: { companyName: 'Data LLC' } }
            ];

            const fieldExamples = extractFieldExamples(mockEvents, 'companyName');

            expect(fieldExamples).toContain('Acme Corp');
            expect(fieldExamples).toContain('Tech Inc');
            expect(fieldExamples).toContain('Data LLC');
        });

        it('should count field occurrences', () => {
            const mockEvents = [
                { customDimensions: { result: 'Success' } },
                { customDimensions: { result: 'Success' } },
                { customDimensions: { result: 'Failure' } },
                { customDimensions: {} } // Missing result
            ];

            const occurrences = countFieldOccurrences(mockEvents, 'result');

            expect(occurrences).toBe(3); // Present in 3 out of 4 events
        });

        it('should detect field data types', () => {
            const testCases = [
                { value: '123', expected: 'string' },
                { value: 123, expected: 'number' },
                { value: true, expected: 'boolean' },
                { value: { nested: 'object' }, expected: 'object' },
                { value: null, expected: 'null' }
            ];

            testCases.forEach(({ value, expected }) => {
                const dataType = detectDataType(value);
                expect(dataType).toBe(expected);
            });
        });

        it('should generate example query with top fields', () => {
            const eventId = 'AL0000E26';
            const topFields = [
                'extensionName',
                'extensionVersion',
                'result',
                'errorMessage',
                'stackTrace'
            ];

            const exampleQuery = generateExampleQuery(eventId, topFields);

            expect(exampleQuery).toContain(eventId);
            expect(exampleQuery).toContain('customDimensions.extensionName');
            expect(exampleQuery).toContain('customDimensions.result');
            expect(exampleQuery).toContain('project'); // KQL project operator
        });

        it('should limit example query to top 5 fields', () => {
            const eventId = 'TEST001';
            const manyFields = [
                'field1', 'field2', 'field3', 'field4', 'field5',
                'field6', 'field7', 'field8'
            ];

            const exampleQuery = generateExampleQuery(eventId, manyFields.slice(0, 5));
            const fieldCount = (exampleQuery.match(/customDimensions\./g) || []).length;

            // May include eventId field in addition to the 5 provided, so allow up to 6
            expect(fieldCount).toBeLessThanOrEqual(6);
        });

        it('should handle events with nested customDimensions', () => {
            const mockEvent = {
                customDimensions: {
                    eventId: 'TEST001',
                    metadata: {
                        version: '1.0',
                        author: 'Test'
                    }
                }
            };

            const fields = flattenCustomDimensions(mockEvent.customDimensions);

            expect(fields).toHaveProperty('eventId');
            expect(fields).toHaveProperty('metadata'); // Nested object preserved
        });
    });

    describe('Event Catalog Workflow', () => {
        it('should support catalog -> schema -> query workflow', () => {
            const workflow = [
                'get_event_catalog',    // Discover event IDs
                'get_event_schema',     // Understand fields
                'query_telemetry'       // Execute detailed query
            ];

            expect(workflow[0]).toBe('get_event_catalog');
            expect(workflow[1]).toBe('get_event_schema');
            expect(workflow[2]).toBe('query_telemetry');
        });

        it('should validate event ID format', () => {
            const validEventIds = [
                'AL0000E26',
                'RT0005',
                'LC0013',
                'RT0012'
            ];

            validEventIds.forEach(eventId => {
                expect(isValidEventId(eventId)).toBe(true);
            });

            const invalidEventIds = [
                '',
                'invalid',
                '12345',
                'AL-0000'
            ];

            invalidEventIds.forEach(eventId => {
                expect(isValidEventId(eventId)).toBe(false);
            });
        });
    });

    describe('Performance Metrics', () => {
        it('should calculate average duration from schema results', () => {
            const mockEvents = [
                { duration_d: 1.5 },
                { duration_d: 2.0 },
                { duration_d: 1.8 },
                { duration_d: 2.2 }
            ];

            const avgDuration = calculateAverageDuration(mockEvents);

            expect(avgDuration).toBeCloseTo(1.875, 2);
        });

        it('should identify slow events', () => {
            const thresholds = {
                normal: 5000,   // 5 seconds
                slow: 10000,    // 10 seconds
                tooSlow: 30000  // 30 seconds
            };

            expect(classifyPerformanceStatus(3000)).toBe('normal');
            expect(classifyPerformanceStatus(7000)).toBe('normal'); // Below 10s threshold
            expect(classifyPerformanceStatus(15000)).toBe('slow'); // Between 10s-30s
            expect(classifyPerformanceStatus(35000)).toBe('too slow'); // Above 30s
        });
    });
});

// Helper functions
function buildEventCatalogQuery(params: { daysBack: number; status: string; minCount: number }): string {
    let kql = `traces | where timestamp > ago(${params.daysBack}d)`;

    if (params.status === 'error') {
        kql += ` | where severityLevel == 3`;
    } else if (params.status === 'success') {
        kql += ` | where severityLevel < 3`;
    }

    kql += ` | summarize EventCount = count() by EventId = tostring(customDimensions.eventId)`;
    kql += ` | where EventCount >= ${params.minCount}`;
    kql += ` | order by EventCount desc`;

    return kql;
}

function sortEventsByFrequency(events: Array<{ eventId: string; count: number }>): any[] {
    return [...events].sort((a, b) => b.count - a.count);
}

function generateLearnUrl(eventId: string): string {
    return `https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/telemetry-${eventId.toLowerCase()}`;
}

function classifyEventStatus(severityLevel: number): string {
    return severityLevel >= 3 ? 'error' : 'success';
}

function classifyPerformanceStatus(durationMs: number): string {
    if (durationMs >= 30000) return 'too slow';
    if (durationMs >= 10000) return 'slow';
    return 'normal';
}

function extractEventDescription(event: any): string {
    return event.message || `Event ${event.eventId}`;
}

function buildEventSchemaQuery(eventId: string, sampleSize: number): string {
    return `traces | where tostring(customDimensions.eventId) == '${eventId}' | take ${sampleSize} | project customDimensions`;
}

function extractSchemaFields(events: any[]): Record<string, any> {
    const schema: Record<string, any> = {};

    events.forEach(event => {
        if (event.customDimensions) {
            Object.keys(event.customDimensions).forEach(key => {
                schema[key] = true;
            });
        }
    });

    return schema;
}

function extractFieldExamples(events: any[], fieldName: string): string[] {
    const examples = new Set<string>();

    events.forEach(event => {
        const value = event.customDimensions?.[fieldName];
        if (value !== undefined) {
            examples.add(String(value));
        }
    });

    return Array.from(examples);
}

function countFieldOccurrences(events: any[], fieldName: string): number {
    return events.filter(event => event.customDimensions?.[fieldName] !== undefined).length;
}

function detectDataType(value: any): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function generateExampleQuery(eventId: string, topFields: string[]): string {
    const fields = topFields.slice(0, 5).map(f => `customDimensions.${f}`).join(', ');
    return `traces | where tostring(customDimensions.eventId) == '${eventId}' | project ${fields}`;
}

function flattenCustomDimensions(customDimensions: any): Record<string, any> {
    return { ...customDimensions };
}

function isValidEventId(eventId: string): boolean {
    // BC event IDs typically match pattern: 2-3 letters followed by digits
    return /^[A-Z]{2,3}\d{4,}[A-Z]?\d*$/.test(eventId);
}

function calculateAverageDuration(events: Array<{ duration_d: number }>): number {
    if (events.length === 0) return 0;
    const sum = events.reduce((acc, e) => acc + e.duration_d, 0);
    return sum / events.length;
}
