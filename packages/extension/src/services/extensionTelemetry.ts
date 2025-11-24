/**
 * VS Code Extension Usage Telemetry Implementation
 * 
 * Wrapper around @vscode/extension-telemetry with rate limiting and level filtering
 */

import * as vscode from 'vscode';
import { IUsageTelemetry } from '@bctb/shared';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * VS Code telemetry levels (from settings)
 */
export type VSCodeTelemetryLevel = 'off' | 'crash' | 'error' | 'all';

/**
 * Get current telemetry level from VS Code settings
 */
export function getVSCodeTelemetryLevel(): VSCodeTelemetryLevel {
    const config = vscode.workspace.getConfiguration('telemetry');
    const level = config.get<string>('telemetryLevel', 'all');

    // Normalize to known values
    if (level === 'off') return 'off';
    if (level === 'crash') return 'crash';
    if (level === 'error') return 'error';
    return 'all';
}

/**
 * Telemetry level filter - respects VS Code telemetry settings
 * Wraps any IUsageTelemetry implementation
 */
export class TelemetryLevelFilter implements IUsageTelemetry {
    private innerTelemetry: IUsageTelemetry;
    private getLevel: () => VSCodeTelemetryLevel;

    constructor(innerTelemetry: IUsageTelemetry, getLevel: () => VSCodeTelemetryLevel) {
        this.innerTelemetry = innerTelemetry;
        this.getLevel = getLevel;
    }

    trackEvent(name: string, properties?: Record<string, any>, measurements?: Record<string, number>): void {
        const level = this.getLevel();
        if (level === 'off') return;
        if (level === 'all') {
            this.innerTelemetry.trackEvent(name, properties, measurements);
        }
        // crash/error levels: only track exceptions, not events
    }

    trackException(error: Error, properties?: Record<string, string>): void {
        const level = this.getLevel();
        if (level === 'off') return;
        // Track exceptions for crash/error/all levels
        if (level === 'crash' || level === 'error' || level === 'all') {
            this.innerTelemetry.trackException(error, properties);
        }
    }

    trackDependency(name: string, data: string, durationMs: number, success: boolean, resultCode?: string, properties?: Record<string, string>): void {
        const level = this.getLevel();
        if (level === 'off') return;
        if (level === 'all') {
            this.innerTelemetry.trackDependency(name, data, durationMs, success, resultCode, properties);
        }
        // crash/error levels: don't track dependencies
    }

    trackTrace(message: string, properties?: Record<string, string>): void {
        const level = this.getLevel();
        if (level === 'off') return;
        if (level === 'all') {
            this.innerTelemetry.trackTrace(message, properties);
        }
        // crash/error levels: don't track traces
    }

    async flush(): Promise<void> {
        await this.innerTelemetry.flush();
    }
}

/**
 * VS Code-specific telemetry implementation using @vscode/extension-telemetry
 */
export class VSCodeUsageTelemetry implements IUsageTelemetry {
    private reporter: any;

    constructor(extensionId: string, extensionVersion: string, connectionString: string) {
        const TelemetryReporter = require('@vscode/extension-telemetry').default;
        this.reporter = new TelemetryReporter(connectionString);
    }

    trackEvent(name: string, properties?: Record<string, any>, measurements?: Record<string, number>): void {
        // Convert all properties to strings (required by TelemetryReporter)
        const stringProps: Record<string, string> = {};
        if (properties) {
            for (const [key, value] of Object.entries(properties)) {
                stringProps[key] = String(value);
            }
        }

        this.reporter.sendTelemetryEvent(name, stringProps, measurements);
    }

    trackException(error: Error, properties?: Record<string, string>): void {
        this.reporter.sendTelemetryErrorEvent('Exception', {
            errorName: error.name,
            errorMessage: error.message,
            ...properties
        });
    }

    trackDependency(name: string, data: string, durationMs: number, success: boolean, resultCode?: string, properties?: Record<string, string>): void {
        this.reporter.sendTelemetryEvent('Dependency', {
            dependencyName: name,
            dependencyData: data,
            success: String(success),
            resultCode: resultCode || '',
            ...properties
        }, {
            duration: durationMs
        });
    }

    trackTrace(message: string, properties?: Record<string, string>): void {
        this.reporter.sendTelemetryEvent('Trace', {
            message,
            ...properties
        });
    }

    async flush(): Promise<void> {
        await this.reporter.dispose();
    }
}

/**
 * Installation ID management for GDPR-compliant pseudonymous tracking
 */

/**
 * Get or create installation ID (stored in VS Code global storage)
 * Returns a stable pseudonymous identifier per user
 * 
 * Migration: If a workspace .bctb-installation-id file exists, it will be
 * migrated to global storage and removed from the workspace.
 */
export function getInstallationId(context: vscode.ExtensionContext): string {
    // Check for existing global ID first
    let installationId = context.globalState.get<string>('installationId');

    // Migration: Always check for legacy workspace file and clean it up
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        const legacyFile = path.join(workspaceFolder.uri.fsPath, '.bctb-installation-id');
        try {
            if (fs.existsSync(legacyFile)) {
                // If we don't have a global ID yet, migrate the workspace ID
                if (!installationId) {
                    const workspaceId = fs.readFileSync(legacyFile, 'utf8').trim();
                    if (workspaceId) {
                        installationId = workspaceId;
                        context.globalState.update('installationId', installationId);
                    }
                }
                // Always remove the workspace file (cleanup)
                fs.unlinkSync(legacyFile);
            }
        } catch (error) {
            // Ignore migration errors
        }
    }

    // Generate new ID if still not found
    if (!installationId) {
        installationId = crypto.randomUUID();
        context.globalState.update('installationId', installationId);
    }

    return installationId;
}

/**
 * Reset installation ID (GDPR right to reset pseudonymous identifier)
 */
export function resetInstallationId(context: vscode.ExtensionContext): void {
    // Generate new global ID
    const newId = crypto.randomUUID();
    context.globalState.update('installationId', newId);
}

/**
 * Correlation context for distributed tracing
 */
export interface CorrelationContext {
    correlationId: string;
    operationName: string;
    parentId?: string;
}

/**
 * Run an operation with telemetry tracking (events + errors)
 */
export async function runWithUsageTelemetry<T>(
    usageTelemetry: IUsageTelemetry,
    operationName: string,
    operation: (context: CorrelationContext) => Promise<T>,
    properties?: Record<string, string>
): Promise<T> {
    const correlationId = crypto.randomUUID();
    const startTime = Date.now();
    const context: CorrelationContext = { correlationId, operationName };

    const enrichedProps = {
        ...properties,
        correlationId,
        operationName
    };

    usageTelemetry.trackEvent(`${operationName}.Started`, enrichedProps);

    try {
        const result = await operation(context);
        const durationMs = Date.now() - startTime;

        usageTelemetry.trackEvent(`${operationName}.Completed`, enrichedProps, { duration: durationMs });

        return result;
    } catch (error) {
        const durationMs = Date.now() - startTime;

        usageTelemetry.trackEvent(`${operationName}.Failed`, enrichedProps, { duration: durationMs });

        if (error instanceof Error) {
            usageTelemetry.trackException(error, enrichedProps);
        }

        throw error;
    }
}
