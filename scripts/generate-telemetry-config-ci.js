/**
 * Generate telemetry config for CI builds
 * Creates a dev-mode telemetry config with empty connection string
 */

const fs = require('fs');
const path = require('path');

const dir = path.join('packages', 'shared', 'src');
const filePath = path.join(dir, 'telemetryConfig.generated.ts');

// Ensure directory exists
fs.mkdirSync(dir, { recursive: true });

// Generate dev-mode config (no telemetry)
const content = `/**
 * GENERATED FILE - DO NOT EDIT MANUALLY
 * CI Build - Development mode (no telemetry)
 */
export const TELEMETRY_CONNECTION_STRING = '';
`;

fs.writeFileSync(filePath, content, 'utf8');

console.log(`✓ Generated ${filePath} (dev mode - no telemetry)`);
