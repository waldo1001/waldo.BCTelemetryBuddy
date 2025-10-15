/**
 * PII sanitization functions
 * Redacts personally identifiable information from query results
 */

/**
 * Redact email addresses
 */
export function redactEmails(text: string): string {
    // Match email patterns
    return text.replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        '[EMAIL_REDACTED]'
    );
}

/**
 * Partially mask IP addresses (keep first two octets)
 */
export function maskIPs(text: string): string {
    // IPv4 pattern
    return text.replace(
        /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g,
        '$1.$2.xxx.xxx'
    );
}

/**
 * Partially mask GUIDs (keep first 8 characters)
 */
export function maskGUIDs(text: string): string {
    return text.replace(
        /\b([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
        '$1-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
    );
}

/**
 * Redact phone numbers (various formats)
 */
export function redactPhones(text: string): string {
    // Match common phone patterns
    return text.replace(
        /\b(?:\+?1[-.]?)?\(?([0-9]{3})\)?[-.]?([0-9]{3})[-.]?([0-9]{4})\b/g,
        '[PHONE_REDACTED]'
    );
}

/**
 * Redact URLs with user info
 */
export function redactSensitiveURLs(text: string): string {
    // Match URLs with user info (e.g., username:password@domain)
    return text.replace(
        /\b(https?:\/\/)([^:]+):([^@]+)@/g,
        '$1[USER_REDACTED]:[PASS_REDACTED]@'
    );
}

/**
 * Main sanitization function
 * Apply all PII redaction rules
 */
export function sanitize(text: string, enabled: boolean): string {
    if (!enabled || !text) {
        return text;
    }

    let sanitized = text;

    // Apply all redaction functions
    sanitized = redactEmails(sanitized);
    sanitized = maskIPs(sanitized);
    sanitized = maskGUIDs(sanitized);
    sanitized = redactPhones(sanitized);
    sanitized = redactSensitiveURLs(sanitized);

    return sanitized;
}

/**
 * Sanitize object by recursively applying sanitization to all string values
 */
export function sanitizeObject<T>(obj: T, enabled: boolean): T {
    if (!enabled || !obj) {
        return obj;
    }

    if (typeof obj === 'string') {
        return sanitize(obj, enabled) as T;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item, enabled)) as T;
    }

    if (typeof obj === 'object' && obj !== null) {
        const sanitized: any = {};

        for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeObject(value, enabled);
        }

        return sanitized as T;
    }

    return obj;
}
