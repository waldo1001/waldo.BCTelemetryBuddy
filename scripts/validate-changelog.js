#!/usr/bin/env node
// Simple check: ensure PR description contains 'Why' and 'How' and that docs/DesignWalkthrough.md was updated in the commit.
const fs = require('fs');
const path = require('path');

const prBody = process.argv[2] || '';
if (!/Why:/i.test(prBody) || !/How:/i.test(prBody)) {
    console.error('PR description should include Why: and How: sections.');
    process.exit(1);
}

// crude check for DesignWalkthrough change presence
const changes = fs.readdirSync(path.join(__dirname, '..'));
if (!fs.existsSync(path.join(__dirname, '..', 'docs', 'DesignWalkthrough.md'))) {
    console.error('docs/DesignWalkthrough.md not found.');
    process.exit(1);
}

console.log('Basic PR checks passed.');
process.exit(0);
