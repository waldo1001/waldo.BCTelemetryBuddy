/**
 * Tests for Usage Telemetry core functionality
 */

import { NoOpUsageTelemetry, RateLimitedUsageTelemetry, IUsageTelemetry } from '../usageTelemetry';

describe('NoOpUsageTelemetry', () => {
    let telemetry: NoOpUsageTelemetry;

    beforeEach(() => {
        telemetry = new NoOpUsageTelemetry();
    });

    test('trackEvent does nothing', () => {
        expect(() => {
            telemetry.trackEvent('TestEvent', { prop: 'value' }, { metric: 123 });
        }).not.toThrow();
    });

    test('trackException does nothing', () => {
        expect(() => {
            telemetry.trackException(new Error('test error'));
        }).not.toThrow();
    });

    test('trackDependency does nothing', () => {
        expect(() => {
            telemetry.trackDependency('KustoQuery', 'test query', 100, true, '200');
        }).not.toThrow();
    });

    test('trackTrace does nothing', () => {
        expect(() => {
            telemetry.trackTrace('test message');
        }).not.toThrow();
    });

    test('flush returns resolved promise', async () => {
        await expect(telemetry.flush()).resolves.toBeUndefined();
    });
});

describe('RateLimitedUsageTelemetry', () => {
    let mockInnerTelemetry: jest.Mocked<IUsageTelemetry>;
    let rateLimited: RateLimitedUsageTelemetry;

    beforeEach(() => {
        mockInnerTelemetry = {
            trackEvent: jest.fn(),
            trackException: jest.fn(),
            trackDependency: jest.fn(),
            trackTrace: jest.fn(),
            flush: jest.fn().mockResolvedValue(undefined)
        };
    });

    test('allows events within session limit', () => {
        rateLimited = new RateLimitedUsageTelemetry(mockInnerTelemetry, {
            maxEventsPerSession: 10,
            maxEventsPerMinute: 100,
            maxIdenticalErrors: 5
        });

        for (let i = 0; i < 10; i++) {
            rateLimited.trackEvent('TestEvent', { index: i });
        }

        expect(mockInnerTelemetry.trackEvent).toHaveBeenCalledTimes(10);
    });

    test('blocks events exceeding session limit', () => {
        rateLimited = new RateLimitedUsageTelemetry(mockInnerTelemetry, {
            maxEventsPerSession: 5,
            maxEventsPerMinute: 100,
            maxIdenticalErrors: 5
        });

        for (let i = 0; i < 10; i++) {
            rateLimited.trackEvent('TestEvent', { index: i });
        }

        expect(mockInnerTelemetry.trackEvent).toHaveBeenCalledTimes(5);
    });

    test('throttles identical errors after max count', () => {
        rateLimited = new RateLimitedUsageTelemetry(mockInnerTelemetry, {
            maxEventsPerSession: 1000,
            maxEventsPerMinute: 100,
            maxIdenticalErrors: 3
        });

        const error = new Error('Same error');
        const props = { stackHash: 'abc123' };

        // Track same error 5 times
        for (let i = 0; i < 5; i++) {
            rateLimited.trackException(error, props);
        }

        // Should track 3 times, then throttle + 1 throttle event = 4 total events
        expect(mockInnerTelemetry.trackException).toHaveBeenCalledTimes(3);
        expect(mockInnerTelemetry.trackEvent).toHaveBeenCalledWith(
            'UsageTelemetry.ErrorThrottled',
            expect.objectContaining({
                errorType: 'Error',
                occurrences: '3'
            })
        );
    });

    test('allows different errors independently', () => {
        rateLimited = new RateLimitedUsageTelemetry(mockInnerTelemetry, {
            maxEventsPerSession: 1000,
            maxEventsPerMinute: 100,
            maxIdenticalErrors: 2
        });

        rateLimited.trackException(new Error('Error 1'), { stackHash: 'hash1' });
        rateLimited.trackException(new Error('Error 1'), { stackHash: 'hash1' });
        rateLimited.trackException(new Error('Error 2'), { stackHash: 'hash2' });
        rateLimited.trackException(new Error('Error 2'), { stackHash: 'hash2' });

        expect(mockInnerTelemetry.trackException).toHaveBeenCalledTimes(4);
    });

    test('enforces per-minute rate limit', async () => {
        rateLimited = new RateLimitedUsageTelemetry(mockInnerTelemetry, {
            maxEventsPerSession: 1000,
            maxEventsPerMinute: 3,
            maxIdenticalErrors: 10
        });

        // Send 5 events rapidly
        for (let i = 0; i < 5; i++) {
            rateLimited.trackEvent(`Event${i}`);
        }

        // Should only track 3 (per-minute limit)
        expect(mockInnerTelemetry.trackEvent).toHaveBeenCalledTimes(3);
    });

    test('passes through to inner telemetry within limits', () => {
        rateLimited = new RateLimitedUsageTelemetry(mockInnerTelemetry, {
            maxEventsPerSession: 1000,
            maxEventsPerMinute: 100,
            maxIdenticalErrors: 10
        });

        rateLimited.trackEvent('Event1', { prop: 'value' }, { metric: 123 });
        rateLimited.trackDependency('Dependency1', 'data', 100, true, '200', { prop: 'value' });
        rateLimited.trackTrace('Trace1', { prop: 'value' });

        expect(mockInnerTelemetry.trackEvent).toHaveBeenCalledWith('Event1', { prop: 'value' }, { metric: 123 });
        expect(mockInnerTelemetry.trackDependency).toHaveBeenCalledWith('Dependency1', 'data', 100, true, '200', { prop: 'value' });
        expect(mockInnerTelemetry.trackTrace).toHaveBeenCalledWith('Trace1', { prop: 'value' });
    });

    test('flush calls inner telemetry flush', async () => {
        rateLimited = new RateLimitedUsageTelemetry(mockInnerTelemetry);
        await rateLimited.flush();
        expect(mockInnerTelemetry.flush).toHaveBeenCalledTimes(1);
    });

    test('swallows inner telemetry errors silently', () => {
        mockInnerTelemetry.trackEvent.mockImplementation(() => {
            throw new Error('Inner telemetry error');
        });

        rateLimited = new RateLimitedUsageTelemetry(mockInnerTelemetry);

        expect(() => {
            rateLimited.trackEvent('TestEvent');
        }).not.toThrow();
    });
});
