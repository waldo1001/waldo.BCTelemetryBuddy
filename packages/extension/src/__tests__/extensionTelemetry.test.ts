/**
 * Tests for VS Code Extension Telemetry
 */

import {
    TelemetryLevelFilter,
    VSCodeTelemetryLevel,
    runWithUsageTelemetry,
    CorrelationContext,
    VSCodeUsageTelemetry,
    getVSCodeTelemetryLevel
} from '../services/extensionTelemetry';
import { IUsageTelemetry } from '@bctb/shared';
import * as vscode from 'vscode';

// Mock inner telemetry
class MockUsageTelemetry implements IUsageTelemetry {
    events: Array<{ name: string; properties?: any; measurements?: any }> = [];
    exceptions: Array<{ error: Error; properties?: any }> = [];
    dependencies: Array<{ name: string; data: string; durationMs: number; success: boolean; resultCode?: string; properties?: any }> = [];
    traces: Array<{ message: string; properties?: any }> = [];

    trackEvent(name: string, properties?: any, measurements?: any): void {
        this.events.push({ name, properties, measurements });
    }

    trackException(error: Error, properties?: any): void {
        this.exceptions.push({ error, properties });
    }

    trackDependency(name: string, data: string, durationMs: number, success: boolean, resultCode?: string, properties?: any): void {
        this.dependencies.push({ name, data, durationMs, success, resultCode, properties });
    }

    trackTrace(message: string, properties?: any): void {
        this.traces.push({ message, properties });
    }

    async flush(): Promise<void> {
        // No-op
    }

    reset(): void {
        this.events = [];
        this.exceptions = [];
        this.dependencies = [];
        this.traces = [];
    }
}

describe('TelemetryLevelFilter', () => {
    let mockTelemetry: MockUsageTelemetry;
    let levelFilter: TelemetryLevelFilter;
    let currentLevel: VSCodeTelemetryLevel = 'all';

    beforeEach(() => {
        mockTelemetry = new MockUsageTelemetry();
        levelFilter = new TelemetryLevelFilter(mockTelemetry, () => currentLevel);
    });

    describe('level: off', () => {
        beforeEach(() => {
            currentLevel = 'off';
            mockTelemetry.reset();
        });

        test('blocks all events', () => {
            levelFilter.trackEvent('TestEvent');
            expect(mockTelemetry.events).toHaveLength(0);
        });

        test('blocks all exceptions', () => {
            levelFilter.trackException(new Error('test'));
            expect(mockTelemetry.exceptions).toHaveLength(0);
        });

        test('blocks all dependencies', () => {
            levelFilter.trackDependency('Dep', 'data', 100, true);
            expect(mockTelemetry.dependencies).toHaveLength(0);
        });

        test('blocks all traces', () => {
            levelFilter.trackTrace('message');
            expect(mockTelemetry.traces).toHaveLength(0);
        });
    });

    describe('level: crash', () => {
        beforeEach(() => {
            currentLevel = 'crash';
            mockTelemetry.reset();
        });

        test('blocks events', () => {
            levelFilter.trackEvent('TestEvent');
            expect(mockTelemetry.events).toHaveLength(0);
        });

        test('allows exceptions', () => {
            levelFilter.trackException(new Error('test'));
            expect(mockTelemetry.exceptions).toHaveLength(1);
        });

        test('blocks dependencies', () => {
            levelFilter.trackDependency('Dep', 'data', 100, true);
            expect(mockTelemetry.dependencies).toHaveLength(0);
        });

        test('blocks traces', () => {
            levelFilter.trackTrace('message');
            expect(mockTelemetry.traces).toHaveLength(0);
        });
    });

    describe('level: error', () => {
        beforeEach(() => {
            currentLevel = 'error';
            mockTelemetry.reset();
        });

        test('blocks events', () => {
            levelFilter.trackEvent('TestEvent');
            expect(mockTelemetry.events).toHaveLength(0);
        });

        test('allows exceptions', () => {
            levelFilter.trackException(new Error('test'));
            expect(mockTelemetry.exceptions).toHaveLength(1);
        });

        test('blocks dependencies', () => {
            levelFilter.trackDependency('Dep', 'data', 100, true);
            expect(mockTelemetry.dependencies).toHaveLength(0);
        });

        test('blocks traces', () => {
            levelFilter.trackTrace('message');
            expect(mockTelemetry.traces).toHaveLength(0);
        });
    });

    describe('level: all', () => {
        beforeEach(() => {
            currentLevel = 'all';
            mockTelemetry.reset();
        });

        test('allows events', () => {
            levelFilter.trackEvent('TestEvent');
            expect(mockTelemetry.events).toHaveLength(1);
        });

        test('allows exceptions', () => {
            levelFilter.trackException(new Error('test'));
            expect(mockTelemetry.exceptions).toHaveLength(1);
        });

        test('allows dependencies', () => {
            levelFilter.trackDependency('Dep', 'data', 100, true);
            expect(mockTelemetry.dependencies).toHaveLength(1);
        });

        test('allows traces', () => {
            levelFilter.trackTrace('message');
            expect(mockTelemetry.traces).toHaveLength(1);
        });
    });

    test('flush delegates to inner telemetry', async () => {
        const flushSpy = jest.spyOn(mockTelemetry, 'flush');
        await levelFilter.flush();
        expect(flushSpy).toHaveBeenCalledTimes(1);
    });
});

describe('runWithUsageTelemetry', () => {
    let mockTelemetry: MockUsageTelemetry;

    beforeEach(() => {
        mockTelemetry = new MockUsageTelemetry();
    });

    test('tracks start and completion events for successful operation', async () => {
        const result = await runWithUsageTelemetry(
            mockTelemetry,
            'TestOperation',
            async () => 'success'
        );

        expect(result).toBe('success');
        expect(mockTelemetry.events).toHaveLength(2);
        expect(mockTelemetry.events[0].name).toBe('TestOperation.Started');
        expect(mockTelemetry.events[1].name).toBe('TestOperation.Completed');
        expect(mockTelemetry.events[1].measurements?.duration).toBeGreaterThanOrEqual(0);
    });

    test('tracks start, failed, and exception for failed operation', async () => {
        const testError = new Error('Operation failed');

        await expect(
            runWithUsageTelemetry(
                mockTelemetry,
                'TestOperation',
                async () => {
                    throw testError;
                }
            )
        ).rejects.toThrow('Operation failed');

        expect(mockTelemetry.events).toHaveLength(2);
        expect(mockTelemetry.events[0].name).toBe('TestOperation.Started');
        expect(mockTelemetry.events[1].name).toBe('TestOperation.Failed');
        expect(mockTelemetry.exceptions).toHaveLength(1);
        expect(mockTelemetry.exceptions[0].error).toBe(testError);
    });

    test('includes correlation ID in all events', async () => {
        await runWithUsageTelemetry(
            mockTelemetry,
            'TestOp',
            async () => 'ok'
        );

        const correlationId = mockTelemetry.events[0].properties.correlationId;
        expect(correlationId).toBeDefined();
        expect(mockTelemetry.events[1].properties.correlationId).toBe(correlationId);
    });

    test('includes custom properties in events', async () => {
        await runWithUsageTelemetry(
            mockTelemetry,
            'TestOp',
            async () => 'ok',
            { customProp: 'value' }
        );

        expect(mockTelemetry.events[0].properties.customProp).toBe('value');
        expect(mockTelemetry.events[1].properties.customProp).toBe('value');
    });

    test('provides correlation context to operation', async () => {
        let capturedContext: CorrelationContext | undefined;

        await runWithUsageTelemetry(
            mockTelemetry,
            'TestOp',
            async (context: CorrelationContext) => {
                capturedContext = context;
                return 'ok';
            }
        );

        expect(capturedContext).toBeDefined();
        expect(capturedContext!.correlationId).toBeDefined();
        expect(capturedContext!.operationName).toBe('TestOp');
    });

    test('measures operation duration', async () => {
        await runWithUsageTelemetry(
            mockTelemetry,
            'SlowOp',
            async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return 'done';
            }
        );

        const completedEvent = mockTelemetry.events.find(e => e.name === 'SlowOp.Completed');
        expect(completedEvent!.measurements!.duration).toBeGreaterThan(5);
    });
});

describe('VSCodeUsageTelemetry', () => {
    let mockReporter: any;
    let vscodeTelemetry: VSCodeUsageTelemetry;

    beforeEach(() => {
        // Mock the TelemetryReporter
        mockReporter = {
            sendTelemetryEvent: jest.fn(),
            sendTelemetryErrorEvent: jest.fn(),
            dispose: jest.fn().mockResolvedValue(undefined)
        };

        // Mock the require for @vscode/extension-telemetry
        jest.doMock('@vscode/extension-telemetry', () => ({
            default: jest.fn(() => mockReporter)
        }), { virtual: true });

        vscodeTelemetry = new VSCodeUsageTelemetry('test.extension', '1.0.0', 'InstrumentationKey=test-key');
    });

    afterEach(() => {
        jest.dontMock('@vscode/extension-telemetry');
    });

    test('trackEvent converts properties to strings', () => {
        vscodeTelemetry.trackEvent('TestEvent', {
            strProp: 'text',
            numProp: 123,
            boolProp: true
        }, { metric: 42 });

        expect(mockReporter.sendTelemetryEvent).toHaveBeenCalledWith(
            'TestEvent',
            {
                strProp: 'text',
                numProp: '123',
                boolProp: 'true'
            },
            { metric: 42 }
        );
    });

    test('trackException sends error event', () => {
        const testError = new Error('Test error');
        vscodeTelemetry.trackException(testError, { context: 'testing' });

        expect(mockReporter.sendTelemetryErrorEvent).toHaveBeenCalledWith(
            'Exception',
            expect.objectContaining({
                errorName: 'Error',
                errorMessage: 'Test error',
                context: 'testing'
            })
        );
    });

    test('trackDependency sends dependency event', () => {
        vscodeTelemetry.trackDependency('AzureAPI', 'GET /data', 150, true, '200', { region: 'westus' });

        expect(mockReporter.sendTelemetryEvent).toHaveBeenCalledWith(
            'Dependency',
            {
                dependencyName: 'AzureAPI',
                dependencyData: 'GET /data',
                success: 'true',
                resultCode: '200',
                region: 'westus'
            },
            { duration: 150 }
        );
    });

    test('trackDependency handles missing result code', () => {
        vscodeTelemetry.trackDependency('Service', 'operation', 100, false);

        expect(mockReporter.sendTelemetryEvent).toHaveBeenCalledWith(
            'Dependency',
            expect.objectContaining({
                resultCode: ''
            }),
            { duration: 100 }
        );
    });

    test('trackTrace sends trace event', () => {
        vscodeTelemetry.trackTrace('Debug message', { level: 'verbose' });

        expect(mockReporter.sendTelemetryEvent).toHaveBeenCalledWith(
            'Trace',
            {
                message: 'Debug message',
                level: 'verbose'
            }
        );
    });

    test('flush disposes reporter', async () => {
        await vscodeTelemetry.flush();
        expect(mockReporter.dispose).toHaveBeenCalledTimes(1);
    });
});

describe('getVSCodeTelemetryLevel', () => {
    let mockConfig: any;

    beforeEach(() => {
        mockConfig = {
            get: jest.fn()
        };
        jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('returns off when telemetry level is off', () => {
        mockConfig.get.mockReturnValue('off');
        expect(getVSCodeTelemetryLevel()).toBe('off');
    });

    test('returns crash when telemetry level is crash', () => {
        mockConfig.get.mockReturnValue('crash');
        expect(getVSCodeTelemetryLevel()).toBe('crash');
    });

    test('returns error when telemetry level is error', () => {
        mockConfig.get.mockReturnValue('error');
        expect(getVSCodeTelemetryLevel()).toBe('error');
    });

    test('returns all when telemetry level is all', () => {
        mockConfig.get.mockReturnValue('all');
        expect(getVSCodeTelemetryLevel()).toBe('all');
    });

    test('defaults to all for unknown values', () => {
        mockConfig.get.mockReturnValue('unknown');
        expect(getVSCodeTelemetryLevel()).toBe('all');
    });

    test('defaults to all when not set', () => {
        mockConfig.get.mockReturnValue(undefined);
        expect(getVSCodeTelemetryLevel()).toBe('all');
    });
});
