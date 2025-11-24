/**
 * Usage Telemetry Interface and Implementations
 * 
 * This module provides telemetry tracking for BCTelemetryBuddy extension/MCP usage.
 * IMPORTANT: This is separate from TelemetryService which queries BC telemetry data.
 */

/**
 * Core interface for tracking usage telemetry events
 */
export interface IUsageTelemetry {
    /**
     * Track a custom event (e.g., command invocation, tool usage)
     */
    trackEvent(name: string, properties?: Record<string, string | number | boolean>, measurements?: Record<string, number>): void;

    /**
     * Track a dependency call (e.g., Kusto query, external API)
     */
    trackDependency(name: string, data: string, durationMs: number, success: boolean, resultCode?: string, properties?: Record<string, string>): void;

    /**
     * Track an exception/error
     */
    trackException(error: Error, properties?: Record<string, string>): void;

    /**
     * Track a trace/log message
     */
    trackTrace(message: string, properties?: Record<string, string>): void;

    /**
     * Flush any pending telemetry (e.g., before shutdown)
     */
    flush(): Promise<void>;
}

/**
 * No-op implementation used when telemetry is disabled
 */
export class NoOpUsageTelemetry implements IUsageTelemetry {
    trackEvent(_name: string, _properties?: Record<string, string | number | boolean>, _measurements?: Record<string, number>): void {
        // No-op
    }

    trackDependency(_name: string, _data: string, _durationMs: number, _success: boolean, _resultCode?: string, _properties?: Record<string, string>): void {
        // No-op
    }

    trackException(_error: Error, _properties?: Record<string, string>): void {
        // No-op
    }

    trackTrace(_message: string, _properties?: Record<string, string>): void {
        // No-op
    }

    async flush(): Promise<void> {
        // No-op
    }
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
    maxIdenticalErrors: number;      // Max same error per session (default: 10)
    maxEventsPerSession: number;     // Max total events per session (default: 1000)
    maxEventsPerMinute: number;      // Max events per minute (default: 100)
    errorCooldownMs: number;         // Cooldown after max errors (default: 60000)
}

/**
 * Rate-limited telemetry wrapper to prevent runaway costs
 */
export class RateLimitedUsageTelemetry implements IUsageTelemetry {
    private innerTelemetry: IUsageTelemetry;
    private config: RateLimitConfig;

    // Tracking state
    private errorCounts = new Map<string, number>();
    private eventCount = 0;
    private minuteEventCounts: { timestamp: number; count: number }[] = [];
    private throttledErrors = new Set<string>();

    constructor(innerTelemetry: IUsageTelemetry, config?: Partial<RateLimitConfig>) {
        this.innerTelemetry = innerTelemetry;
        this.config = {
            maxIdenticalErrors: config?.maxIdenticalErrors ?? 10,
            maxEventsPerSession: config?.maxEventsPerSession ?? 1000,
            maxEventsPerMinute: config?.maxEventsPerMinute ?? 100,
            errorCooldownMs: config?.errorCooldownMs ?? 60000
        };
    }

    trackEvent(name: string, properties?: Record<string, any>, measurements?: Record<string, number>): void {
        if (!this.shouldTrack(name)) {
            return;
        }

        try {
            this.incrementEventCount();
            this.innerTelemetry.trackEvent(name, properties, measurements);
        } catch (error) {
            // Swallow telemetry errors silently
        }
    }

    trackException(error: Error, properties?: Record<string, string>): void {
        const errorKey = `${error.name}:${properties?.stackHash || ''}`;

        // Check if this error has been throttled
        if (this.throttledErrors.has(errorKey)) {
            return;
        }

        // Get current count for this error
        const currentCount = this.errorCounts.get(errorKey) || 0;

        if (currentCount >= this.config.maxIdenticalErrors) {
            // Throttle this error
            this.throttledErrors.add(errorKey);

            // Track that we throttled
            try {
                this.innerTelemetry.trackEvent('UsageTelemetry.ErrorThrottled', {
                    errorType: error.name,
                    errorKey,
                    occurrences: currentCount.toString()
                });
            } catch {
                // Swallow
            }

            // Schedule cooldown
            setTimeout(() => {
                this.errorCounts.delete(errorKey);
                this.throttledErrors.delete(errorKey);
            }, this.config.errorCooldownMs);

            return;
        }

        // Increment error count
        this.errorCounts.set(errorKey, currentCount + 1);

        if (!this.shouldTrack('exception')) {
            return;
        }

        try {
            this.incrementEventCount();
            this.innerTelemetry.trackException(error, properties);
        } catch {
            // Swallow
        }
    }

    trackDependency(name: string, data: string, durationMs: number, success: boolean, resultCode?: string, properties?: Record<string, string>): void {
        if (!this.shouldTrack('dependency')) {
            return;
        }

        try {
            this.incrementEventCount();
            this.innerTelemetry.trackDependency(name, data, durationMs, success, resultCode, properties);
        } catch {
            // Swallow
        }
    }

    trackTrace(message: string, properties?: Record<string, string>): void {
        if (!this.shouldTrack('trace')) {
            return;
        }

        try {
            this.incrementEventCount();
            this.innerTelemetry.trackTrace(message, properties);
        } catch {
            // Swallow
        }
    }

    async flush(): Promise<void> {
        try {
            await this.innerTelemetry.flush();
        } catch {
            // Swallow
        }
    }

    private shouldTrack(eventType: string): boolean {
        // Check session limit
        if (this.eventCount >= this.config.maxEventsPerSession) {
            return false;
        }

        // Check per-minute limit
        const now = Date.now();
        const oneMinuteAgo = now - 60000;

        // Clean old entries
        this.minuteEventCounts = this.minuteEventCounts.filter(e => e.timestamp > oneMinuteAgo);

        // Count events in last minute
        const recentCount = this.minuteEventCounts.reduce((sum, e) => sum + e.count, 0);

        if (recentCount >= this.config.maxEventsPerMinute) {
            return false;
        }

        return true;
    }

    private incrementEventCount(): void {
        this.eventCount++;

        const now = Date.now();
        const current = this.minuteEventCounts[this.minuteEventCounts.length - 1];

        if (current && now - current.timestamp < 1000) {
            current.count++;
        } else {
            this.minuteEventCounts.push({ timestamp: now, count: 1 });
        }
    }
}
