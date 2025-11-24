/**
 * MCP Server Usage Telemetry Implementation
 * 
 * Uses Azure Application Insights SDK for Node.js
 */

import * as appInsights from 'applicationinsights';
import { IUsageTelemetry } from '@bctb/shared';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Application Insights-based telemetry implementation for MCP
 */
export class AppInsightsUsageTelemetry implements IUsageTelemetry {
    private client: appInsights.TelemetryClient;

    constructor(connectionString: string, installationId: string, version: string) {
        // Configure Application Insights
        appInsights.setup(connectionString)
            .setAutoCollectRequests(false)
            .setAutoCollectPerformance(false, false)
            .setAutoCollectExceptions(false)
            .setAutoCollectDependencies(false)
            .setAutoCollectConsole(false)
            .setUseDiskRetryCaching(true);

        appInsights.start();

        this.client = appInsights.defaultClient;

        // Set common properties
        this.client.commonProperties = {
            installationId,
            version,
            component: 'MCP'
        };
    }

    trackEvent(name: string, properties?: Record<string, any>, measurements?: Record<string, number>): void {
        // Convert all properties to strings
        const stringProps: Record<string, string> = {};
        if (properties) {
            for (const [key, value] of Object.entries(properties)) {
                stringProps[key] = String(value);
            }
        }

        this.client.trackEvent({
            name,
            properties: stringProps,
            measurements
        });
    }

    trackException(error: Error, properties?: Record<string, string>): void {
        this.client.trackException({
            exception: error,
            properties: {
                errorName: error.name,
                errorMessage: error.message,
                ...properties
            }
        });
    }

    trackDependency(name: string, data: string, durationMs: number, success: boolean, resultCode?: string, properties?: Record<string, string>): void {
        this.client.trackDependency({
            name,
            data,
            duration: durationMs,
            success,
            resultCode: resultCode || (success ? '200' : '500'),
            dependencyTypeName: 'External',
            properties
        });
    }

    trackTrace(message: string, properties?: Record<string, string>): void {
        this.client.trackTrace({
            message,
            properties
        });
    }

    async flush(): Promise<void> {
        return new Promise((resolve) => {
            this.client.flush();
            // Wait a bit for final flush
            setTimeout(resolve, 2000);
        });
    }
}

/**
 * Installation ID management for MCP (workspace-specific)
 */

const INSTALLATION_ID_FILE = '.bctb-installation-id';

/**
 * Get or create installation ID for MCP workspace
 * Returns a stable pseudonymous identifier per workspace
 */
export function getMCPInstallationId(workspacePath: string): string {
    const idFile = path.join(workspacePath, INSTALLATION_ID_FILE);

    try {
        if (fs.existsSync(idFile)) {
            return fs.readFileSync(idFile, 'utf8').trim();
        }
    } catch {
        // Fall through to generate new ID
    }

    // Generate new ID
    const newId = crypto.randomUUID();

    try {
        fs.writeFileSync(idFile, newId, 'utf8');
    } catch (err) {
        console.error(`Failed to write installation ID file: ${err}`);
        // Continue with in-memory ID
    }

    return newId;
}

/**
 * Create MCP telemetry instance from configuration
 */
export function createMCPUsageTelemetry(
    connectionString: string,
    workspacePath: string,
    version: string
): IUsageTelemetry | null {
    if (!connectionString) {
        return null;
    }

    try {
        const installationId = getMCPInstallationId(workspacePath);
        return new AppInsightsUsageTelemetry(connectionString, installationId, version);
    } catch (error) {
        console.error(`Failed to initialize MCP usage telemetry: ${error}`);
        return null;
    }
}
