/**
 * Usage Telemetry Utility Functions
 * 
 * Shared utilities for telemetry sanitization, hashing, and GDPR compliance.
 */

import * as crypto from 'crypto';

/**
 * Generate a pseudonymous GUID for installation tracking
 */
export function generateGuid(): string {
    return crypto.randomUUID();
}

/**
 * Hash a value to create a pseudonymous identifier
 * Used for session IDs, workspace IDs, etc.
 */
export function hashValue(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex').substring(0, 16);
}

/**
 * Sanitize stack traces to remove PII and file paths
 * Keeps only repo-relative paths for debugging
 */
export function sanitizeStackTrace(stack: string, repoRoot?: string): string {
    let sanitized = stack;

    // Remove absolute file paths - keep only relative to repo
    if (repoRoot) {
        const repoRootEscaped = repoRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const repoRootRegex = new RegExp(repoRootEscaped, 'gi');
        sanitized = sanitized.replace(repoRootRegex, '<repo>');
    }

    // Remove common PII patterns
    // Windows paths (C:\Users\username\...)
    sanitized = sanitized.replace(/[A-Z]:\\Users\\[^\\]+/gi, '<user-path>');

    // Unix paths (/home/username/...)
    sanitized = sanitized.replace(/\/home\/[^\/]+/gi, '<user-path>');

    // Mac paths (/Users/username/...)
    sanitized = sanitized.replace(/\/Users\/[^\/]+/gi, '<user-path>');

    // Remove query strings and connection strings
    sanitized = sanitized.replace(/InstrumentationKey=[^;]+/gi, 'InstrumentationKey=<redacted>');
    sanitized = sanitized.replace(/password=[^&\s;]+/gi, 'password=<redacted>');
    sanitized = sanitized.replace(/apiKey=[^&\s;]+/gi, 'apiKey=<redacted>');

    // Remove email addresses
    sanitized = sanitized.replace(/[\w.-]+@[\w.-]+\.\w+/gi, '<email>');

    return sanitized;
}

/**
 * Sanitize error messages to remove PII
 * Keeps error type and general message structure
 */
export function sanitizeErrorMessage(message: string): string {
    let sanitized = message;

    // Remove file paths
    sanitized = sanitized.replace(/[A-Z]:\\[^\s"']+/gi, '<path>');
    sanitized = sanitized.replace(/\/[\w.-/]+/gi, (match) => {
        // Keep common paths like /api/v1 but remove user-specific paths
        if (match.startsWith('/home/') || match.startsWith('/Users/')) {
            return '<path>';
        }
        return match;
    });

    // Remove connection strings and secrets
    sanitized = sanitized.replace(/InstrumentationKey=[^;]+/gi, 'InstrumentationKey=<redacted>');
    sanitized = sanitized.replace(/password=[^&\s;]+/gi, 'password=<redacted>');
    sanitized = sanitized.replace(/apiKey=[^&\s;]+/gi, 'apiKey=<redacted>');
    sanitized = sanitized.replace(/bearer\s+[\w.-]+/gi, 'bearer <redacted>');

    // Remove email addresses
    sanitized = sanitized.replace(/[\w.-]+@[\w.-]+\.\w+/gi, '<email>');

    // Remove IP addresses
    sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '<ip>');

    // Remove GUIDs (except in well-known contexts like app IDs)
    sanitized = sanitized.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<guid>');

    return sanitized;
}

/**
 * Categorize errors for better aggregation in Application Insights
 */
export function categorizeError(error: Error): string {
    const errorName = error.name;
    const errorMessage = error.message.toLowerCase();

    // Network errors
    if (errorMessage.includes('network') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('etimedout') ||
        errorMessage.includes('enotfound')) {
        return 'NetworkError';
    }

    // Authentication errors
    if (errorMessage.includes('auth') ||
        errorMessage.includes('unauthorized') ||
        errorMessage.includes('forbidden') ||
        errorMessage.includes('token')) {
        return 'AuthenticationError';
    }

    // Kusto/query errors
    if (errorMessage.includes('kusto') ||
        errorMessage.includes('query') ||
        errorMessage.includes('syntax error')) {
        return 'QueryError';
    }

    // Configuration errors
    if (errorMessage.includes('config') ||
        errorMessage.includes('setting') ||
        errorMessage.includes('invalid')) {
        return 'ConfigurationError';
    }

    // Permission errors
    if (errorMessage.includes('permission') ||
        errorMessage.includes('access denied') ||
        errorMessage.includes('eacces')) {
        return 'PermissionError';
    }

    // File system errors
    if (errorMessage.includes('file') ||
        errorMessage.includes('enoent') ||
        errorMessage.includes('directory')) {
        return 'FileSystemError';
    }

    // Default: use error name or 'UnknownError'
    return errorName || 'UnknownError';
}

/**
 * Create enriched error properties for telemetry
 */
export function createErrorProperties(error: Error, repoRoot?: string): Record<string, string> {
    const properties: Record<string, string> = {
        errorType: error.name || 'Error',
        errorCategory: categorizeError(error),
        errorMessage: sanitizeErrorMessage(error.message)
    };

    if (error.stack) {
        const sanitizedStack = sanitizeStackTrace(error.stack, repoRoot);
        properties.stackTrace = sanitizedStack;
        properties.stackHash = hashValue(sanitizedStack);
    }

    return properties;
}

/**
 * Extract correlation properties for distributed tracing
 */
export interface CorrelationContext {
    correlationId: string;
    operationName?: string;
    parentId?: string;
}

export function createCorrelationContext(operationName: string, parentId?: string): CorrelationContext {
    return {
        correlationId: generateGuid(),
        operationName,
        parentId
    };
}

export function correlationContextToProperties(context: CorrelationContext): Record<string, string> {
    const props: Record<string, string> = {
        correlationId: context.correlationId
    };

    if (context.operationName) {
        props.operationName = context.operationName;
    }

    if (context.parentId) {
        props.parentId = context.parentId;
    }

    return props;
}
