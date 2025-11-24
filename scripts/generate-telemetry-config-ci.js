/**
 * Generate telemetry config for CI builds
 * Creates telemetry config with connection string from environment variable or empty for dev mode
 */

const fs = require('fs');
const path = require('path');

const dir = path.join('packages', 'shared', 'src');
const filePath = path.join(dir, 'telemetryConfig.generated.ts');

// Ensure directory exists
fs.mkdirSync(dir, { recursive: true });

// Get connection string from environment or use empty string
const connectionString = process.env.AI_CONNECTION_STRING || '';

// Generate config
const content = `/**
 * GENERATED FILE - DO NOT EDIT MANUALLY
 * ${connectionString ? 'Production build - Azure Application Insights enabled' : 'CI Build - Development mode (no telemetry)'}
 */
export const TELEMETRY_CONNECTION_STRING = '${connectionString}';
`;

fs.writeFileSync(filePath, content, 'utf8');

console.log(`✓ Generated ${filePath} ${connectionString ? '(production mode with telemetry)' : '(dev mode - no telemetry)'}`);

