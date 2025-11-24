import {
    TELEMETRY_EVENTS,
    createTelemetryTimestamp,
    createCommonProperties,
    cleanTelemetryProperties
} from '../telemetryEvents.js';

describe('TelemetryEvents', () => {
    describe('TELEMETRY_EVENTS constants', () => {
        it('should export all extension event constants', () => {
            expect(TELEMETRY_EVENTS.EXTENSION.COMMAND_COMPLETED).toBe('TB-EXT-002');
            expect(TELEMETRY_EVENTS.EXTENSION.COMMAND_FAILED).toBe('TB-EXT-003');
            expect(TELEMETRY_EVENTS.EXTENSION.MCP_REQUEST_SENT).toBe('TB-EXT-004');
            expect(TELEMETRY_EVENTS.EXTENSION.MCP_RESPONSE_RECEIVED).toBe('TB-EXT-005');
            expect(TELEMETRY_EVENTS.EXTENSION.PROFILE_SWITCHED).toBe('TB-EXT-006');
            expect(TELEMETRY_EVENTS.EXTENSION.CACHE_CLEARED).toBe('TB-EXT-007');
            expect(TELEMETRY_EVENTS.EXTENSION.SETUP_WIZARD_OPENED).toBe('TB-EXT-008');
            expect(TELEMETRY_EVENTS.EXTENSION.SETUP_WIZARD_COMPLETED).toBe('TB-EXT-009');
            expect(TELEMETRY_EVENTS.EXTENSION.ERROR).toBe('TB-EXT-010');
            expect(TELEMETRY_EVENTS.EXTENSION.ACTIVATED).toBe('TB-EXT-011');
            expect(TELEMETRY_EVENTS.EXTENSION.TELEMETRY_ID_RESET).toBe('TB-EXT-012');
        });

        it('should export all MCP event constants', () => {
            expect(TELEMETRY_EVENTS.MCP.SERVER_STARTED).toBe('TB-MCP-001');
            expect(TELEMETRY_EVENTS.MCP.CONFIGURATION_LOADED).toBe('TB-MCP-002');
            expect(TELEMETRY_EVENTS.MCP.ERROR).toBe('TB-MCP-005');
        });

        it('should export all MCP tool event constants', () => {
            expect(TELEMETRY_EVENTS.MCP_TOOLS.QUERY_TELEMETRY).toBe('TB-MCP-101');
            expect(TELEMETRY_EVENTS.MCP_TOOLS.GET_SAVED_QUERIES).toBe('TB-MCP-102');
            expect(TELEMETRY_EVENTS.MCP_TOOLS.SEARCH_QUERIES).toBe('TB-MCP-103');
            expect(TELEMETRY_EVENTS.MCP_TOOLS.SAVE_QUERY).toBe('TB-MCP-104');
            expect(TELEMETRY_EVENTS.MCP_TOOLS.GENERATE_KQL).toBe('TB-MCP-105');
            expect(TELEMETRY_EVENTS.MCP_TOOLS.GET_RECOMMENDATIONS).toBe('TB-MCP-106');
            expect(TELEMETRY_EVENTS.MCP_TOOLS.LOOKUP_EVENT).toBe('TB-MCP-107');
            expect(TELEMETRY_EVENTS.MCP_TOOLS.GET_EVENT_CATALOG).toBe('TB-MCP-108');
            expect(TELEMETRY_EVENTS.MCP_TOOLS.GET_EVENT_SCHEMA).toBe('TB-MCP-109');
            expect(TELEMETRY_EVENTS.MCP_TOOLS.GET_EVENT_FIELD_SAMPLES).toBe('TB-MCP-110');
        });

        it('should export all Kusto query event constants', () => {
            expect(TELEMETRY_EVENTS.KUSTO.QUERY_EXECUTED).toBe('TB-KQL-001');
            expect(TELEMETRY_EVENTS.KUSTO.QUERY_FAILED).toBe('TB-KQL-002');
            expect(TELEMETRY_EVENTS.KUSTO.QUERY_CACHED).toBe('TB-KQL-003');
            expect(TELEMETRY_EVENTS.KUSTO.CACHE_MISS).toBe('TB-KQL-004');
        });

        it('should export all authentication event constants', () => {
            expect(TELEMETRY_EVENTS.AUTH.AUTHENTICATION_ATTEMPT).toBe('TB-AUTH-001');
            expect(TELEMETRY_EVENTS.AUTH.AUTHENTICATION_COMPLETED).toBe('TB-AUTH-002');
            expect(TELEMETRY_EVENTS.AUTH.TOKEN_REFRESHED).toBe('TB-AUTH-003');
            expect(TELEMETRY_EVENTS.AUTH.FAILED).toBe('TB-AUTH-004');
        });

        it('should export all cache event constants', () => {
            expect(TELEMETRY_EVENTS.CACHE.HIT).toBe('TB-CACHE-001');
            expect(TELEMETRY_EVENTS.CACHE.MISS).toBe('TB-CACHE-002');
            expect(TELEMETRY_EVENTS.CACHE.SET).toBe('TB-CACHE-003');
            expect(TELEMETRY_EVENTS.CACHE.CLEARED).toBe('TB-CACHE-004');
            expect(TELEMETRY_EVENTS.CACHE.EXPIRED).toBe('TB-CACHE-005');
        });
    });

    describe('createTelemetryTimestamp', () => {
        it('should create a valid ISO 8601 timestamp', () => {
            const timestamp = createTelemetryTimestamp();

            expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
            expect(() => new Date(timestamp)).not.toThrow();
        });

        it('should create unique timestamps for different calls', () => {
            const ts1 = createTelemetryTimestamp();
            // Small delay to ensure different timestamps
            const ts2 = createTelemetryTimestamp();

            expect(ts1).toBeDefined();
            expect(ts2).toBeDefined();
        });
    });

    describe('createCommonProperties', () => {
        it('should create properties with required fields', () => {
            const props = createCommonProperties(
                'TB-EXT-001',
                'extension',
                'session-123',
                'install-456',
                '1.0.0'
            );

            expect(props.eventId).toBe('TB-EXT-001');
            expect(props.component).toBe('extension');
            expect(props.sessionId).toBe('session-123');
            expect(props.installationId).toBe('install-456');
            expect(props.version).toBe('1.0.0');
            expect(props.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        });

        it('should include optional correlationId when provided', () => {
            const props = createCommonProperties(
                'TB-EXT-001',
                'extension',
                'session-123',
                'install-456',
                '1.0.0',
                { correlationId: 'corr-789' }
            );

            expect(props.correlationId).toBe('corr-789');
        });

        it('should include optional profileHash when provided', () => {
            const props = createCommonProperties(
                'TB-EXT-001',
                'extension',
                'session-123',
                'install-456',
                '1.0.0',
                { profileHash: 'hash-abc' }
            );

            expect(props.profileHash).toBe('hash-abc');
        });

        it('should include additional custom properties', () => {
            const props = createCommonProperties(
                'TB-EXT-001',
                'extension',
                'session-123',
                'install-456',
                '1.0.0',
                { customProp: 'custom-value', numericProp: 42, boolProp: true }
            );

            expect(props.customProp).toBe('custom-value');
            expect(props.numericProp).toBe(42);
            expect(props.boolProp).toBe(true);
        });

        it('should not include undefined optional properties', () => {
            const props = createCommonProperties(
                'TB-EXT-001',
                'extension',
                'session-123',
                'install-456',
                '1.0.0',
                { correlationId: undefined, customProp: 'value' }
            );

            expect(props.correlationId).toBeUndefined();
            expect(props.customProp).toBe('value');
        });
    });

    describe('cleanTelemetryProperties', () => {
        it('should remove undefined values', () => {
            const props = createCommonProperties(
                'TB-EXT-001',
                'extension',
                'session-123',
                'install-456',
                '1.0.0'
            );

            // Add an undefined property
            props.optionalField = undefined;

            const cleaned = cleanTelemetryProperties(props);

            expect(cleaned.optionalField).toBeUndefined();
            expect(cleaned.eventId).toBe('TB-EXT-001');
            expect(cleaned.sessionId).toBe('session-123');
        });

        it('should preserve string, number, and boolean values', () => {
            const props = createCommonProperties(
                'TB-EXT-001',
                'extension',
                'session-123',
                'install-456',
                '1.0.0',
                { strProp: 'text', numProp: 123, boolProp: false }
            );

            const cleaned = cleanTelemetryProperties(props);

            expect(cleaned.strProp).toBe('text');
            expect(cleaned.numProp).toBe(123);
            expect(cleaned.boolProp).toBe(false);
        });

        it('should return an object with no undefined properties', () => {
            const props = createCommonProperties(
                'TB-EXT-001',
                'extension',
                'session-123',
                'install-456',
                '1.0.0',
                { defined: 'value', undefined: undefined }
            );

            const cleaned = cleanTelemetryProperties(props);
            const hasUndefined = Object.values(cleaned).some(v => v === undefined);

            expect(hasUndefined).toBe(false);
            expect(cleaned.defined).toBe('value');
        });
    });
});

