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
import * as os from 'os';

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
 * Installation ID management for MCP (user-profile storage)
 */

const INSTALLATION_ID_FILE = '.bctb-installation-id';
const USER_PROFILE_DIR = '.bctb';
const USER_PROFILE_ID_FILE = 'installation-id';

/**
 * Get the user profile directory for BCTB
 */
function getUserProfileDir(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, USER_PROFILE_DIR);
}

/**
 * Get or create installation ID for MCP
 * Returns a stable pseudonymous identifier per user (stored in user profile)
 * 
 * Migration: If a workspace .bctb-installation-id file exists, it will be
 * migrated to user profile and removed from the workspace.
 */
export function getMCPInstallationId(workspacePath: string): string {
    const profileDir = getUserProfileDir();
    const profileIdFile = path.join(profileDir, USER_PROFILE_ID_FILE);

    // Check for existing user profile ID first
    try {
        if (fs.existsSync(profileIdFile)) {
            const existingId = fs.readFileSync(profileIdFile, 'utf8').trim();
            if (existingId) {
                // Cleanup: Always remove workspace file if it exists
                cleanupWorkspaceIdFile(workspacePath);
                return existingId;
            }
        }
    } catch {
        // Fall through to migration/generation
    }

    // Migration: Check for legacy workspace file
    const workspaceIdFile = path.join(workspacePath, INSTALLATION_ID_FILE);
    try {
        if (fs.existsSync(workspaceIdFile)) {
            const workspaceId = fs.readFileSync(workspaceIdFile, 'utf8').trim();
            if (workspaceId) {
                // Migrate to user profile
                ensureDirectoryExists(profileDir);
                fs.writeFileSync(profileIdFile, workspaceId, 'utf8');
                // Remove workspace file
                fs.unlinkSync(workspaceIdFile);
                return workspaceId;
            }
        }
    } catch (err) {
        console.error(`Failed to migrate workspace installation ID: ${err}`);
        // Fall through to generate new ID
    }

    // Generate new ID and store in user profile
    const newId = crypto.randomUUID();

    try {
        ensureDirectoryExists(profileDir);
        fs.writeFileSync(profileIdFile, newId, 'utf8');
    } catch (err) {
        console.error(`Failed to write installation ID file: ${err}`);
        // Continue with in-memory ID
    }

    return newId;
}

/**
 * Ensure a directory exists, creating it if necessary
 */
function ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Clean up legacy workspace installation ID file
 */
function cleanupWorkspaceIdFile(workspacePath: string): void {
    const workspaceIdFile = path.join(workspacePath, INSTALLATION_ID_FILE);
    try {
        if (fs.existsSync(workspaceIdFile)) {
            fs.unlinkSync(workspaceIdFile);
        }
    } catch (err) {
        // Ignore cleanup errors
    }
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
