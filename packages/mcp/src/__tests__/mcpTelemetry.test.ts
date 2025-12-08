/**
 * Tests for MCP Telemetry Module
 */

import { createMCPUsageTelemetry } from '../mcpTelemetry';
import * as path from 'path';
import * as os from 'os';

describe('createMCPUsageTelemetry', () => {
    const testWorkspacePath = path.join(os.tmpdir(), 'test-workspace');
    const validConnectionString = 'InstrumentationKey=12345678-1234-1234-1234-123456789012;IngestionEndpoint=https://test.applicationinsights.azure.com/';

    it('should return null for undefined connection string', () => {
        const result = createMCPUsageTelemetry(undefined as any, testWorkspacePath, '1.0.0');
        expect(result).toBeNull();
    });

    it('should return null for empty connection string', () => {
        const result = createMCPUsageTelemetry('', testWorkspacePath, '1.0.0');
        expect(result).toBeNull();
    });

    it('should return null for whitespace-only connection string', () => {
        const result = createMCPUsageTelemetry('   ', testWorkspacePath, '1.0.0');
        expect(result).toBeNull();
    });

    it('should create telemetry instance for valid connection string', () => {
        const result = createMCPUsageTelemetry(validConnectionString, testWorkspacePath, '1.0.0');
        expect(result).not.toBeNull();
        expect(result).toHaveProperty('trackEvent');
        expect(result).toHaveProperty('trackException');
        expect(result).toHaveProperty('trackDependency');
    });

    it('should not throw error when Application Insights initialization fails with empty string', () => {
        // This test verifies that the empty string check prevents the Application Insights SDK
        // from attempting to parse an invalid URL, which would cause stderr errors
        expect(() => {
            createMCPUsageTelemetry('', testWorkspacePath, '1.0.0');
        }).not.toThrow();
    });
});
