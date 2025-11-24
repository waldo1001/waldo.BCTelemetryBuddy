/**
 * Telemetry Event IDs and Constants
 * 
 * Centralized event ID definitions following the design spec.
 * Format: TB-{Component}-{Number}
 */

// Extension Events
export const TELEMETRY_EVENTS = {
  // Extension Events (TB-EXT-xxx)
  EXTENSION: {
    COMMAND_COMPLETED: 'TB-EXT-002',
    COMMAND_FAILED: 'TB-EXT-003',
    MCP_REQUEST_SENT: 'TB-EXT-004',
    MCP_RESPONSE_RECEIVED: 'TB-EXT-005',
    PROFILE_SWITCHED: 'TB-EXT-006',
    CACHE_CLEARED: 'TB-EXT-007',
    SETUP_WIZARD_OPENED: 'TB-EXT-008',
    SETUP_WIZARD_COMPLETED: 'TB-EXT-009',
    ERROR: 'TB-EXT-010',
    ACTIVATED: 'TB-EXT-011',
    TELEMETRY_ID_RESET: 'TB-EXT-012'
  },

  // MCP Server Events (TB-MCP-xxx)
  MCP: {
    SERVER_STARTED: 'TB-MCP-001',
    CONFIGURATION_LOADED: 'TB-MCP-002',
    ERROR: 'TB-MCP-005'
  },

  // MCP Tool Events (TB-MCP-1xx)
  MCP_TOOLS: {
    QUERY_TELEMETRY: 'TB-MCP-101',
    GET_SAVED_QUERIES: 'TB-MCP-102',
    SEARCH_QUERIES: 'TB-MCP-103',
    SAVE_QUERY: 'TB-MCP-104',
    GENERATE_KQL: 'TB-MCP-105',
    GET_RECOMMENDATIONS: 'TB-MCP-106',
    LOOKUP_EVENT: 'TB-MCP-107',
    GET_EVENT_CATALOG: 'TB-MCP-108',
    GET_EVENT_SCHEMA: 'TB-MCP-109',
    GET_EVENT_FIELD_SAMPLES: 'TB-MCP-110'
  },

  // Kusto Query Events (TB-KQL-xxx)
  KUSTO: {
    QUERY_EXECUTED: 'TB-KQL-001',
    QUERY_FAILED: 'TB-KQL-002',
    QUERY_CACHED: 'TB-KQL-003',
    CACHE_MISS: 'TB-KQL-004'
  },

  // Authentication Events (TB-AUTH-xxx)
  AUTH: {
    AUTHENTICATION_ATTEMPT: 'TB-AUTH-001',
    AUTHENTICATION_COMPLETED: 'TB-AUTH-002',
    TOKEN_REFRESHED: 'TB-AUTH-003',
    FAILED: 'TB-AUTH-004'
  },

  // Cache Events (TB-CACHE-xxx)
  CACHE: {
    HIT: 'TB-CACHE-001',
    MISS: 'TB-CACHE-002',
    SET: 'TB-CACHE-003',
    CLEARED: 'TB-CACHE-004',
    EXPIRED: 'TB-CACHE-005'
  }
} as const;

/**
 * Helper function to create common properties for all events
 */
export interface CommonTelemetryProperties {
  eventId: string;
  timestamp: string;
  component: 'extension' | 'mcp' | 'shared';
  sessionId: string;
  installationId: string;
  version: string;
  correlationId?: string;
  profileHash?: string;
  [key: string]: string | number | boolean | undefined; // Allow additional custom properties
}

/**
 * Create a standardized timestamp in ISO 8601 format
 */
export function createTelemetryTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Create common properties object with required fields
 */
export function createCommonProperties(
  eventId: string,
  component: 'extension' | 'mcp' | 'shared',
  sessionId: string,
  installationId: string,
  version: string,
  options?: {
    correlationId?: string;
    profileHash?: string;
    [key: string]: string | number | boolean | undefined; // Allow additional custom properties
  }
): CommonTelemetryProperties {
  const props: CommonTelemetryProperties = {
    eventId,
    timestamp: createTelemetryTimestamp(),
    component,
    sessionId,
    installationId,
    version
  };

  // Add optional properties only if they are defined
  if (options?.correlationId) {
    props.correlationId = options.correlationId;
  }
  if (options?.profileHash) {
    props.profileHash = options.profileHash;
  }

  // Add any additional custom properties, filtering out undefined values
  if (options) {
    Object.keys(options).forEach(key => {
      if (key !== 'correlationId' && key !== 'profileHash' && options[key] !== undefined) {
        props[key] = options[key]!;
      }
    });
  }

  return props;
}

/**
 * Remove undefined values from telemetry properties
 * This ensures compatibility with trackEvent which doesn't accept undefined
 */
export function cleanTelemetryProperties(props: CommonTelemetryProperties): Record<string, string | number | boolean> {
  const cleaned: Record<string, string | number | boolean> = {};
  Object.keys(props).forEach(key => {
    const value = props[key];
    if (value !== undefined) {
      cleaned[key] = value;
    }
  });
  return cleaned;
}
