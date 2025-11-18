#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Read version from package.json
const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')
);

// Generate version.ts
const versionTs = `// Auto-generated file - do not edit manually
export const VERSION = '${packageJson.version}';
`;

// Write to src/version.ts
fs.writeFileSync(
    path.join(__dirname, '..', 'src', 'version.ts'),
    versionTs
);

console.log(`✓ Generated version.ts with version ${packageJson.version}`);
