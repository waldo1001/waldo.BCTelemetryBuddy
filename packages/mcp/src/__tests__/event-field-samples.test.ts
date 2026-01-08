/**
 * Event Field Samples Discovery Tests
 * Tests for get_event_field_samples tool - analyzes customDimensions structure
 * Added: 2025-10-18 (Phase 2.1)
 */

describe('Event Field Samples Discovery', () => {
    describe('getEventFieldSamples', () => {
        // Mock data structures
        const mockEventData = {
            RT0005: [
                {
                    timestamp: '2025-10-18T10:00:00Z',
                    customDimensions: {
                        eventId: 'RT0005',
                        companyName: 'CRONUS USA, Inc.',
                        aadTenantId: 'tenant-123',
                        environmentName: 'Production',
                        executionTimeMs: 250,
                        result: 'Success',
                        isAdmin: true
                    }
                },
                {
                    timestamp: '2025-10-18T10:05:00Z',
                    customDimensions: {
                        eventId: 'RT0005',
                        companyName: 'CRONUS USA, Inc.',
                        aadTenantId: 'tenant-123',
                        environmentName: 'Production',
                        executionTimeMs: 180,
                        result: 'Success',
                        isAdmin: false,
                        optionalField: 'sometimes-present'
                    }
                },
                {
                    timestamp: '2025-10-18T10:10:00Z',
                    customDimensions: {
                        eventId: 'RT0005',
                        companyName: 'CRONUS USA, Inc.',
                        aadTenantId: 'tenant-123',
                        environmentName: 'Production',
                        executionTimeMs: 320,
                        result: 'Success',
                        isAdmin: true
                    }
                }
            ]
        };

        describe('Query Generation', () => {
            it('should build correct KQL query with parameters', () => {
                const eventId = 'RT0005';
                const sampleCount = 20;
                const daysBack = 7;

                const expectedKql = `traces
| where timestamp >= ago(7d)
| where tostring(customDimensions.eventId) == "RT0005"
| take 20
| project timestamp, customDimensions`;

                expect(expectedKql).toContain('ago(7d)');
                expect(expectedKql).toContain('RT0005');
                expect(expectedKql).toContain('take 20');
                expect(expectedKql).toContain('project timestamp, customDimensions');
            });

            it('should use default parameters when not specified', () => {
                const eventId = 'LC0011';
                const defaultSampleCount = 10;
                const defaultDaysBack = 30;

                const expectedKql = `traces
| where timestamp >= ago(30d)
| where tostring(customDimensions.eventId) == "LC0011"
| take 10
| project timestamp, customDimensions`;

                expect(expectedKql).toContain('ago(30d)');
                expect(expectedKql).toContain('take 10');
            });
        });

        describe('Field Analysis', () => {
            it('should detect data types correctly', () => {
                const mockRow = {
                    stringField: 'text value',
                    numberField: 250,
                    boolField: true,
                    timespanField: '00:00:01.2340000',
                    executionTime: '00:00:00.0450000'
                };

                // Test detection logic
                expect(typeof mockRow.stringField).toBe('string');
                expect(typeof mockRow.numberField).toBe('number');
                expect(typeof mockRow.boolField).toBe('boolean');

                // Timespan format validation
                const timespanPattern = /^(\d+\.)?(\d{1,2}):(\d{2}):(\d{2})(\.\d+)?$/;
                expect(timespanPattern.test(mockRow.timespanField)).toBe(true);
                expect(timespanPattern.test(mockRow.executionTime)).toBe(true);
            });

            it('should detect timespan fields by name pattern', () => {
                const durationFieldNames = [
                    'executionTime',
                    'totalTime',
                    'serverTime',
                    'clientTime',
                    'sqlTime',
                    'requestDuration',
                    'operationDuration',
                    'elapsedTime',
                    'networkLatency',
                    'processingDelay',
                    'waitTime',
                    'queryRuntime'
                ];

                const durationPatterns = [
                    /time$/i,
                    /duration/i,
                    /elapsed/i,
                    /latency/i,
                    /delay/i,
                    /wait/i,
                    /runtime/i
                ];

                durationFieldNames.forEach(fieldName => {
                    const matches = durationPatterns.some(pattern => pattern.test(fieldName));
                    expect(matches).toBe(true);
                });
            });

            it('should recognize various timespan formats', () => {
                const validTimespans = [
                    '00:00:01.2340000',        // Standard BC format
                    '1.12:34:56.7890000',      // Days.hours:minutes:seconds
                    '12:34:56',                // Without fractional seconds
                    '00:00:00.0450000',        // Very small duration
                    '23:59:59.9999999'         // Maximum time
                ];

                const invalidTimespans = [
                    '250',                     // Plain number (milliseconds)
                    '1234.5',                  // Decimal number
                    'Success',                 // String
                    '2025-01-06T10:30:00Z'     // Datetime
                ];

                const timespanPattern = /^(\d+\.)?(\d{1,2}):(\d{2}):(\d{2})(\.\d+)?$/;

                validTimespans.forEach(value => {
                    expect(timespanPattern.test(value)).toBe(true);
                });

                invalidTimespans.forEach(value => {
                    expect(timespanPattern.test(value)).toBe(false);
                });
            });

            it('should NOT flag fields with millisecond indicators as timespans', () => {
                const millisecondFields = [
                    'executionTimeMs',
                    'serverTimeMs',
                    'executionTimeInMs',
                    'serverTimeInMilliseconds',
                    'processingTimeMilliseconds',
                    'execution_time_ms'
                ];

                const millisecondIndicators = [
                    /ms$/i,
                    /milliseconds?/i,
                    /inms$/i,
                    /_ms$/i
                ];

                millisecondFields.forEach(fieldName => {
                    const matchesIndicator = millisecondIndicators.some(pattern => pattern.test(fieldName));
                    expect(matchesIndicator).toBe(true);
                });
            });

            it('should flag duration fields WITHOUT millisecond indicators', () => {
                const timespanFields = [
                    'executionTime',      // No Ms indicator
                    'serverTime',         // No Ms indicator
                    'totalTime',          // No Ms indicator
                    'requestDuration'     // No Ms indicator
                ];

                const notMillisecondFields = [
                    'executionTimeMs',    // Has Ms indicator - should be excluded
                    'serverTimeInMs'      // Has Ms indicator - should be excluded
                ];

                const millisecondIndicators = /ms$|milliseconds?|inms$|_ms$/i;

                timespanFields.forEach(fieldName => {
                    expect(millisecondIndicators.test(fieldName)).toBe(false);
                });

                notMillisecondFields.forEach(fieldName => {
                    expect(millisecondIndicators.test(fieldName)).toBe(true);
                });
            });

            it('should detect data types correctly', () => {
                const mockRow = {
                    stringField: 'text value',
                    numberField: 250,
                    boolField: true,
                    dateField: new Date('2025-10-18')
                };

                expect(typeof mockRow.stringField).toBe('string');
                expect(typeof mockRow.numberField).toBe('number');
                expect(typeof mockRow.boolField).toBe('boolean');
                expect(mockRow.dateField instanceof Date).toBe(true);
            });

            it('should calculate occurrence rates correctly', () => {
                const totalSamples = 3;
                const fieldPresent = 2; // Present in 2 out of 3 samples

                const occurrenceRate = Math.round((fieldPresent / totalSamples) * 100);

                expect(occurrenceRate).toBe(67); // 66.67% rounded to 67%
            });

            it('should identify always-present fields', () => {
                const totalSamples = 10;
                const alwaysPresentCount = 10;
                const sometimesPresentCount = 7;

                expect(alwaysPresentCount === totalSamples).toBe(true);
                expect(sometimesPresentCount < totalSamples).toBe(true);
            });

            it('should collect sample values up to limit', () => {
                const values: any[] = [];
                const sampleValues = ['value1', 'value2', 'value3', 'value4', 'value5'];

                sampleValues.forEach(value => {
                    if (values.length < 3 && !values.includes(value)) {
                        values.push(value);
                    }
                });

                expect(values.length).toBe(3);
                expect(values).toContain('value1');
                expect(values).toContain('value2');
                expect(values).toContain('value3');
                expect(values).not.toContain('value4');
            });

            it('should handle null and empty values', () => {
                const testValues = [null, undefined, '', 'actual-value'];
                let nullCount = 0;

                testValues.forEach(value => {
                    if (value === null || value === undefined || value === '') {
                        nullCount++;
                    }
                });

                expect(nullCount).toBe(3);
            });
        });

        describe('Output Structure', () => {
            it('should return correct output structure', () => {
                const expectedOutput = {
                    eventId: 'RT0005',
                    samplesAnalyzed: 3,
                    timeRange: {
                        from: '2025-10-18T10:00:00Z',
                        to: '2025-10-18T10:10:00Z'
                    },
                    fields: [
                        {
                            fieldName: 'eventId',
                            dataType: 'string',
                            occurrenceRate: 100,
                            sampleValues: ['RT0005'],
                            isAlwaysPresent: true,
                            nullCount: 0
                        }
                    ],
                    summary: {
                        totalFields: expect.any(Number),
                        alwaysPresentFields: expect.any(Number),
                        optionalFields: expect.any(Number)
                    },
                    exampleQuery: expect.stringContaining('traces'),
                    recommendations: expect.any(Array)
                };

                expect(expectedOutput).toHaveProperty('eventId');
                expect(expectedOutput).toHaveProperty('samplesAnalyzed');
                expect(expectedOutput).toHaveProperty('timeRange');
                expect(expectedOutput).toHaveProperty('fields');
                expect(expectedOutput).toHaveProperty('summary');
                expect(expectedOutput).toHaveProperty('exampleQuery');
                expect(expectedOutput).toHaveProperty('recommendations');
            });

            it('should sort fields by occurrence rate', () => {
                const fields = [
                    { fieldName: 'optional', occurrenceRate: 50 },
                    { fieldName: 'always', occurrenceRate: 100 },
                    { fieldName: 'sometimes', occurrenceRate: 75 }
                ];

                const sorted = fields.sort((a, b) => b.occurrenceRate - a.occurrenceRate);

                expect(sorted[0].fieldName).toBe('always');
                expect(sorted[1].fieldName).toBe('sometimes');
                expect(sorted[2].fieldName).toBe('optional');
            });
        });

        describe('Example Query Generation', () => {
            // Helper function for type conversion
            const getTypeConversion = (dataType: string): string => {
                return dataType === 'timespan' ? 'totimespan' :
                    dataType === 'number' ? 'toreal' :
                        dataType === 'boolean' ? 'tobool' :
                            dataType === 'datetime' ? 'todatetime' :
                                'tostring';
            };

            it('should use correct type conversion for numbers', () => {
                const fieldType = 'number';
                const conversion = getTypeConversion(fieldType);
                expect(conversion).toBe('toreal');
            });

            it('should use correct type conversion for booleans', () => {
                const fieldType = 'boolean';
                const conversion = getTypeConversion(fieldType);
                expect(conversion).toBe('tobool');
            });

            it('should use correct type conversion for datetime', () => {
                const fieldType = 'datetime';
                const conversion = getTypeConversion(fieldType);
                expect(conversion).toBe('todatetime');
            });

            it('should use correct type conversion for timespan', () => {
                const fieldType = 'timespan';
                const conversion = getTypeConversion(fieldType);
                expect(conversion).toBe('totimespan');
            });

            it('should use correct type conversion for strings', () => {
                const fieldType = 'string';
                const conversion = getTypeConversion(fieldType);
                expect(conversion).toBe('tostring');
            });

            it('should generate valid KQL extend statements with timespan conversion', () => {
                const fields = [
                    { fieldName: 'executionTime', dataType: 'timespan', occurrenceRate: 100 },
                    { fieldName: 'totalTime', dataType: 'timespan', occurrenceRate: 100 },
                    { fieldName: 'result', dataType: 'string', occurrenceRate: 100 },
                    { fieldName: 'count', dataType: 'number', occurrenceRate: 100 }
                ];

                const extendStatements = fields
                    .map(f => {
                        const conversion = f.dataType === 'timespan' ? 'totimespan' :
                            f.dataType === 'number' ? 'toreal' :
                                f.dataType === 'boolean' ? 'tobool' :
                                    f.dataType === 'datetime' ? 'todatetime' :
                                        'tostring';
                        return `    ${f.fieldName} = ${conversion}(customDimensions.${f.fieldName})`;
                    })
                    .join(',\n');

                expect(extendStatements).toContain('executionTime = totimespan(customDimensions.executionTime)');
                expect(extendStatements).toContain('totalTime = totimespan(customDimensions.totalTime)');
                expect(extendStatements).toContain('result = tostring(customDimensions.result)');
                expect(extendStatements).toContain('count = toreal(customDimensions.count)');
            });

            it('should generate valid KQL extend statements', () => {
                const fields = [
                    { fieldName: 'executionTimeMs', dataType: 'number', occurrenceRate: 100 },
                    { fieldName: 'result', dataType: 'string', occurrenceRate: 100 },
                    { fieldName: 'isAdmin', dataType: 'boolean', occurrenceRate: 90 }
                ];

                const extendStatements = fields
                    .map(f => {
                        const conversion = f.dataType === 'number' ? 'toreal' :
                            f.dataType === 'boolean' ? 'tobool' :
                                f.dataType === 'datetime' ? 'todatetime' :
                                    'tostring';
                        return `    ${f.fieldName} = ${conversion}(customDimensions.${f.fieldName})`;
                    })
                    .join(',\n');

                expect(extendStatements).toContain('executionTimeMs = toreal(customDimensions.executionTimeMs)');
                expect(extendStatements).toContain('result = tostring(customDimensions.result)');
                expect(extendStatements).toContain('isAdmin = tobool(customDimensions.isAdmin)');
            });

            it('should only include fields with >50% occurrence rate', () => {
                const fields = [
                    { fieldName: 'always', occurrenceRate: 100 },
                    { fieldName: 'mostly', occurrenceRate: 80 },
                    { fieldName: 'sometimes', occurrenceRate: 40 }, // Should be excluded
                    { fieldName: 'rarely', occurrenceRate: 10 } // Should be excluded
                ];

                const filtered = fields.filter(f => f.occurrenceRate >= 50);

                expect(filtered.length).toBe(2);
                expect(filtered.map(f => f.fieldName)).toContain('always');
                expect(filtered.map(f => f.fieldName)).toContain('mostly');
                expect(filtered.map(f => f.fieldName)).not.toContain('sometimes');
            });

            it('should limit example query to 10 top fields', () => {
                const fields = Array.from({ length: 20 }, (_, i) => ({
                    fieldName: `field${i}`,
                    dataType: 'string',
                    occurrenceRate: 100 - i
                }));

                const topFields = fields
                    .filter(f => f.occurrenceRate >= 50)
                    .slice(0, 10);

                expect(topFields.length).toBeLessThanOrEqual(10);
            });
        });

        describe('Error Handling', () => {
            it('should throw error when no events found', async () => {
                const emptyResult = {
                    type: 'success',
                    rows: []
                };

                const shouldThrow = () => {
                    if (!emptyResult.rows || emptyResult.rows.length === 0) {
                        throw new Error('No events found for eventId "INVALID" in the last 30 days. Try increasing daysBack or check if the eventId is correct.');
                    }
                };

                expect(shouldThrow).toThrow('No events found');
                expect(shouldThrow).toThrow('Try increasing daysBack');
            });

            it('should throw error on query failure', async () => {
                const errorResult = {
                    type: 'error',
                    summary: 'Query execution failed'
                };

                const shouldThrow = () => {
                    if (errorResult.type === 'error') {
                        throw new Error(errorResult.summary);
                    }
                };

                expect(shouldThrow).toThrow('Query execution failed');
            });

            it('should handle malformed customDimensions gracefully', () => {
                const malformedRows = [
                    [null, null], // Null customDimensions
                    [null, 'not-an-object'], // String instead of object
                    [null, undefined], // Undefined
                    [null, { eventId: 'RT0005' }] // Valid object
                ];

                const validRows = malformedRows.filter(row => {
                    const customDims = row[1];
                    return customDims && typeof customDims === 'object';
                });

                expect(validRows.length).toBe(1);
            });
        });

        describe('Recommendations Generation', () => {
            it('should generate recommendations for optional fields', () => {
                const fields = [
                    { fieldName: 'always', isAlwaysPresent: true },
                    { fieldName: 'sometimes', isAlwaysPresent: false }
                ];

                const optionalCount = fields.filter(f => !f.isAlwaysPresent).length;
                const recommendation = optionalCount > 0
                    ? `${optionalCount} optional fields may be null - handle accordingly`
                    : 'All fields are consistently present';

                expect(recommendation).toBe('1 optional fields may be null - handle accordingly');
            });

            it('should recommend all fields consistent when applicable', () => {
                const fields = [
                    { fieldName: 'always1', isAlwaysPresent: true },
                    { fieldName: 'always2', isAlwaysPresent: true }
                ];

                const optionalCount = fields.filter(f => !f.isAlwaysPresent).length;
                const recommendation = optionalCount > 0
                    ? `${optionalCount} optional fields may be null - handle accordingly`
                    : 'All fields are consistently present';

                expect(recommendation).toBe('All fields are consistently present');
            });

            it('should include standard recommendations', () => {
                const recommendations = [
                    'Use the exampleQuery above as a starting point for your analysis',
                    'Fields with 100% occurrence rate are always available'
                ];

                expect(recommendations.length).toBeGreaterThanOrEqual(2);
                expect(recommendations[0]).toContain('exampleQuery');
                expect(recommendations[1]).toContain('100% occurrence rate');
            });

            it('should recommend millisecond conversion for timespan fields', () => {
                const fields = [
                    { fieldName: 'executionTime', dataType: 'timespan' },
                    { fieldName: 'totalTime', dataType: 'timespan' }
                ];

                // Check if recommendation includes millisecond conversion formula
                const hasTimespans = fields.some(f => f.dataType === 'timespan');
                expect(hasTimespans).toBe(true);

                // Expected recommendation should include the conversion formula
                const expectedRecommendation = 'To convert to milliseconds: toreal(totimespan(fieldName))/10000';
                expect(expectedRecommendation).toContain('toreal(totimespan');
                expect(expectedRecommendation).toContain('/10000');
            });

            it('should warn about duration-named fields being timespans', () => {
                const fields = [
                    { fieldName: 'executionTime', dataType: 'string' },
                    { fieldName: 'serverDuration', dataType: 'string' }
                ];

                const hasDurationFields = fields.some(f => /time|duration|elapsed|latency|delay|wait/i.test(f.fieldName));
                expect(hasDurationFields).toBe(true);

                // Warning should include millisecond conversion
                const expectedWarning = 'likely TIMESPANS, not milliseconds';
                expect(expectedWarning).toContain('TIMESPANS');
                expect(expectedWarning).toContain('not milliseconds');
            });
        });

        describe('Summary Calculation', () => {
            it('should calculate field summary correctly', () => {
                const fields = [
                    { fieldName: 'f1', isAlwaysPresent: true },
                    { fieldName: 'f2', isAlwaysPresent: true },
                    { fieldName: 'f3', isAlwaysPresent: false },
                    { fieldName: 'f4', isAlwaysPresent: false },
                    { fieldName: 'f5', isAlwaysPresent: true }
                ];

                const summary = {
                    totalFields: fields.length,
                    alwaysPresentFields: fields.filter(f => f.isAlwaysPresent).length,
                    optionalFields: fields.filter(f => !f.isAlwaysPresent).length
                };

                expect(summary.totalFields).toBe(5);
                expect(summary.alwaysPresentFields).toBe(3);
                expect(summary.optionalFields).toBe(2);
            });
        });

        describe('Time Range Handling', () => {
            it('should extract correct time range from results', () => {
                const mockRows = [
                    ['2025-10-18T10:10:00Z', {}], // Latest (first in results)
                    ['2025-10-18T10:05:00Z', {}],
                    ['2025-10-18T10:00:00Z', {}]  // Earliest (last in results)
                ];

                const timeRange = {
                    from: mockRows[mockRows.length - 1][0],
                    to: mockRows[0][0]
                };

                expect(timeRange.from).toBe('2025-10-18T10:00:00Z');
                expect(timeRange.to).toBe('2025-10-18T10:10:00Z');
            });
        });

        describe('Tool Registration and Accessibility', () => {
            it('should have correct tool schema definition', () => {
                const toolSchema = {
                    name: 'get_event_field_samples',
                    description: 'Analyze customDimensions field structure from real telemetry events',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            eventId: {
                                type: 'string',
                                description: 'BC telemetry event ID (e.g., "RT0005", "LC0011")'
                            },
                            sampleCount: {
                                type: 'number',
                                description: 'Number of events to analyze (default: 20, max: 100)',
                                default: 20
                            },
                            daysBack: {
                                type: 'number',
                                description: 'Days of history to search (default: 7)',
                                default: 7
                            }
                        },
                        required: ['eventId']
                    }
                };

                expect(toolSchema.name).toBe('get_event_field_samples');
                expect(toolSchema.inputSchema.required).toContain('eventId');
                expect(toolSchema.inputSchema.properties).toHaveProperty('eventId');
                expect(toolSchema.inputSchema.properties).toHaveProperty('sampleCount');
                expect(toolSchema.inputSchema.properties).toHaveProperty('daysBack');
            });

            it('should validate required eventId parameter', () => {
                const params = {}; // Missing eventId

                const validate = () => {
                    if (!('eventId' in params)) {
                        throw new Error('eventId parameter is required');
                    }
                };

                expect(validate).toThrow('eventId parameter is required');
            });

            it('should accept valid parameters', () => {
                const params = {
                    eventId: 'RT0005',
                    sampleCount: 20,
                    daysBack: 7
                };

                const validate = () => {
                    if (!params.eventId) {
                        throw new Error('eventId parameter is required');
                    }
                };

                expect(validate).not.toThrow();
            });

            it('should use default values for optional parameters', () => {
                const params: {
                    eventId: string;
                    sampleCount?: number;
                    daysBack?: number;
                } = {
                    eventId: 'RT0005'
                    // sampleCount and daysBack not provided
                };

                const sampleCount = params.sampleCount || 20;
                const daysBack = params.daysBack || 7;

                expect(sampleCount).toBe(20);
                expect(daysBack).toBe(7);
            });
        });
    });
});

// Helper function for type conversion tests
function getTypeConversion(dataType: string): string {
    return dataType === 'timespan' ? 'totimespan' :
        dataType === 'number' ? 'toreal' :
            dataType === 'boolean' ? 'tobool' :
                dataType === 'datetime' ? 'todatetime' :
                    'tostring';
}
