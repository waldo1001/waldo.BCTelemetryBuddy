/**
 * Tests for Usage Telemetry utility functions
 */

import {
    generateGuid,
    hashValue,
    sanitizeStackTrace,
    sanitizeErrorMessage,
    categorizeError,
    createErrorProperties,
    createCorrelationContext,
    correlationContextToProperties
} from '../usageTelemetryUtils';

describe('generateGuid', () => {
    test('generates valid UUID format', () => {
        const guid = generateGuid();
        expect(guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    test('generates unique values', () => {
        const guid1 = generateGuid();
        const guid2 = generateGuid();
        expect(guid1).not.toBe(guid2);
    });
});

describe('hashValue', () => {
    test('generates consistent hash for same input', () => {
        const hash1 = hashValue('test-value');
        const hash2 = hashValue('test-value');
        expect(hash1).toBe(hash2);
    });

    test('generates different hashes for different inputs', () => {
        const hash1 = hashValue('value1');
        const hash2 = hashValue('value2');
        expect(hash1).not.toBe(hash2);
    });

    test('returns 16-character hex string', () => {
        const hash = hashValue('test');
        expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
});

describe('sanitizeStackTrace', () => {
    test('removes absolute Windows paths', () => {
        const stack = 'Error\n    at C:\\Users\\john\\project\\file.ts:10:5';
        const sanitized = sanitizeStackTrace(stack);
        expect(sanitized).toContain('<user-path>');
        expect(sanitized).not.toContain('john');
    });

    test('removes absolute Unix paths', () => {
        const stack = 'Error\n    at /home/john/project/file.ts:10:5';
        const sanitized = sanitizeStackTrace(stack);
        expect(sanitized).toContain('<user-path>');
        expect(sanitized).not.toContain('john');
    });

    test('removes absolute Mac paths', () => {
        const stack = 'Error\n    at /Users/john/project/file.ts:10:5';
        const sanitized = sanitizeStackTrace(stack);
        expect(sanitized).toContain('<user-path>');
        expect(sanitized).not.toContain('john');
    });

    test('replaces repo root with placeholder', () => {
        const stack = 'Error\n    at C:\\Projects\\MyRepo\\src\\file.ts:10:5';
        const sanitized = sanitizeStackTrace(stack, 'C:\\Projects\\MyRepo');
        expect(sanitized).toContain('<repo>');
        expect(sanitized).not.toContain('C:\\Projects\\MyRepo');
    });

    test('removes InstrumentationKey', () => {
        const stack = 'Error: Connection failed\nInstrumentationKey=abc123;endpoint=...';
        const sanitized = sanitizeStackTrace(stack);
        expect(sanitized).toContain('InstrumentationKey=<redacted>');
        expect(sanitized).not.toContain('abc123');
    });

    test('removes email addresses', () => {
        const stack = 'Error: User john.doe@example.com not found';
        const sanitized = sanitizeStackTrace(stack);
        expect(sanitized).toContain('<email>');
        expect(sanitized).not.toContain('john.doe@example.com');
    });
});

describe('sanitizeErrorMessage', () => {
    test('removes Windows file paths', () => {
        const message = 'Failed to read C:\\Users\\john\\file.txt';
        const sanitized = sanitizeErrorMessage(message);
        expect(sanitized).toContain('<path>');
        expect(sanitized).not.toContain('john');
    });

    test('removes connection strings', () => {
        const message = 'Auth failed: InstrumentationKey=secret123;endpoint=...';
        const sanitized = sanitizeErrorMessage(message);
        expect(sanitized).toContain('InstrumentationKey=<redacted>');
        expect(sanitized).not.toContain('secret123');
    });

    test('removes passwords', () => {
        const message = 'Login failed for password=mySecret123';
        const sanitized = sanitizeErrorMessage(message);
        expect(sanitized).toContain('password=<redacted>');
        expect(sanitized).not.toContain('mySecret123');
    });

    test('removes bearer tokens', () => {
        const message = 'Invalid token: bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
        const sanitized = sanitizeErrorMessage(message);
        expect(sanitized).toContain('bearer <redacted>');
        expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    test('removes email addresses', () => {
        const message = 'User john.doe@example.com not found';
        const sanitized = sanitizeErrorMessage(message);
        expect(sanitized).toContain('<email>');
        expect(sanitized).not.toContain('john.doe@example.com');
    });

    test('removes IP addresses', () => {
        const message = 'Connection to 192.168.1.100 refused';
        const sanitized = sanitizeErrorMessage(message);
        expect(sanitized).toContain('<ip>');
        expect(sanitized).not.toContain('192.168.1.100');
    });

    test('removes GUIDs', () => {
        const message = 'Entity 550e8400-e29b-41d4-a716-446655440000 not found';
        const sanitized = sanitizeErrorMessage(message);
        expect(sanitized).toContain('<guid>');
        expect(sanitized).not.toContain('550e8400-e29b-41d4-a716-446655440000');
    });
});

describe('categorizeError', () => {
    test('categorizes network errors', () => {
        expect(categorizeError(new Error('Network connection failed'))).toBe('NetworkError');
        expect(categorizeError(new Error('ECONNREFUSED'))).toBe('NetworkError');
        expect(categorizeError(new Error('ETIMEDOUT'))).toBe('NetworkError');
        expect(categorizeError(new Error('ENOTFOUND host'))).toBe('NetworkError');
    });

    test('categorizes authentication errors', () => {
        expect(categorizeError(new Error('Authentication failed'))).toBe('AuthenticationError');
        expect(categorizeError(new Error('Unauthorized access'))).toBe('AuthenticationError');
        expect(categorizeError(new Error('Token expired'))).toBe('AuthenticationError');
    });

    test('categorizes query errors', () => {
        expect(categorizeError(new Error('Kusto query failed'))).toBe('QueryError');
        expect(categorizeError(new Error('Query syntax error'))).toBe('QueryError');
    });

    test('categorizes configuration errors', () => {
        expect(categorizeError(new Error('Invalid configuration'))).toBe('ConfigurationError');
        expect(categorizeError(new Error('Missing setting'))).toBe('ConfigurationError');
    });

    test('categorizes permission errors', () => {
        expect(categorizeError(new Error('Permission denied'))).toBe('PermissionError');
        expect(categorizeError(new Error('Access denied'))).toBe('PermissionError');
        expect(categorizeError(new Error('EACCES'))).toBe('PermissionError');
    });

    test('categorizes file system errors', () => {
        expect(categorizeError(new Error('File not found'))).toBe('FileSystemError');
        expect(categorizeError(new Error('ENOENT'))).toBe('FileSystemError');
        expect(categorizeError(new Error('Directory error'))).toBe('FileSystemError');
    });

    test('falls back to error name or UnknownError', () => {
        const typedError = new Error('Something went wrong');
        typedError.name = 'CustomError';
        expect(categorizeError(typedError)).toBe('CustomError');

        expect(categorizeError(new Error('Random error'))).toBe('Error');
    });
});

describe('createErrorProperties', () => {
    test('creates properties with error details', () => {
        const error = new Error('Test error');
        error.stack = 'Error: Test error\n    at file.ts:10:5';
        const props = createErrorProperties(error);

        expect(props.errorType).toBe('Error');
        expect(props.errorCategory).toBeDefined();
        expect(props.errorMessage).toBe('Test error');
        expect(props.stackTrace).toBeDefined();
        expect(props.stackHash).toBeDefined();
    });

    test('sanitizes stack trace with repo root', () => {
        const error = new Error('Test');
        error.stack = 'Error\n    at C:\\Projects\\MyRepo\\file.ts:10:5';
        const props = createErrorProperties(error, 'C:\\Projects\\MyRepo');

        expect(props.stackTrace).toContain('<repo>');
        expect(props.stackTrace).not.toContain('C:\\Projects\\MyRepo');
    });

    test('handles errors without stack', () => {
        const error = new Error('Test');
        delete error.stack;
        const props = createErrorProperties(error);

        expect(props.errorType).toBe('Error');
        expect(props.errorMessage).toBe('Test');
        expect(props.stackTrace).toBeUndefined();
        expect(props.stackHash).toBeUndefined();
    });
});

describe('createCorrelationContext', () => {
    test('creates context with correlation ID', () => {
        const context = createCorrelationContext('TestOperation');
        expect(context.correlationId).toBeDefined();
        expect(context.operationName).toBe('TestOperation');
        expect(context.parentId).toBeUndefined();
    });

    test('includes parent ID when provided', () => {
        const context = createCorrelationContext('ChildOp', 'parent-123');
        expect(context.parentId).toBe('parent-123');
    });

    test('generates unique correlation IDs', () => {
        const ctx1 = createCorrelationContext('Op1');
        const ctx2 = createCorrelationContext('Op2');
        expect(ctx1.correlationId).not.toBe(ctx2.correlationId);
    });
});

describe('correlationContextToProperties', () => {
    test('converts context to properties', () => {
        const context = createCorrelationContext('TestOp', 'parent-456');
        const props = correlationContextToProperties(context);

        expect(props.correlationId).toBe(context.correlationId);
        expect(props.operationName).toBe('TestOp');
        expect(props.parentId).toBe('parent-456');
    });

    test('omits undefined properties', () => {
        const context = createCorrelationContext('TestOp');
        const props = correlationContextToProperties(context);

        expect(props.correlationId).toBeDefined();
        expect(props.operationName).toBe('TestOp');
        expect(props.parentId).toBeUndefined();
    });
});
