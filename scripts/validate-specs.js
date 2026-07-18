#!/usr/bin/env node
/**
 * Validates the structure of spec files in /docs/specs/ (see docs/specs/README.md).
 *
 * Checks per file:
 *   - filename matches <issue-nr>-<kebab-topic>.md
 *   - frontmatter: spec === filename stem, issue === numeric prefix,
 *     status ∈ {draft, approved, implemented}, created is YYYY-MM-DD
 *   - required H2 sections present (prefix match, so "## Telemetry (Rule 13)" passes)
 *   - at least one "**ACn:**" bullet, AC IDs unique
 *   - warning (non-fatal): status implemented but Verification rows still "planned"
 *
 * Run manually: node scripts/validate-specs.js [file ...]
 * Run in CI:    node scripts/validate-specs.js (validates all of docs/specs/)
 */

const fs = require('fs');
const path = require('path');

const SPECS_DIR = path.join(__dirname, '..', 'docs', 'specs');

const FILENAME_RE = /^(\d+)-[a-z0-9][a-z0-9-]*\.md$/;
const STATUSES = ['draft', 'approved', 'implemented'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_SECTIONS = [
    'Intent',
    'Actors & scope',
    'Behavior',
    'Acceptance criteria',
    'Non-goals',
    'Telemetry',
    'Verification',
    'Links',
];

/**
 * Parses YAML frontmatter from a markdown string (same line-based approach
 * as scripts/generate-kb-index.js).
 */
function parseFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return null;

    const fm = {};
    for (const line of match[1].split(/\r?\n/)) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;

        const key = line.slice(0, colonIdx).trim();
        const rawValue = line.slice(colonIdx + 1).trim();

        if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
            fm[key] = rawValue
                .slice(1, -1)
                .split(',')
                .map(v => v.trim().replace(/^["']|["']$/g, ''))
                .filter(Boolean);
        } else {
            fm[key] = rawValue.replace(/^["']|["']$/g, '');
        }
    }
    return fm;
}

function validateSpec(filePath) {
    const file = path.basename(filePath);
    const errors = [];
    const warnings = [];

    const nameMatch = file.match(FILENAME_RE);
    if (!nameMatch) {
        errors.push(`filename must match <issue-nr>-<kebab-topic>.md (e.g. 104-settings-validation-fix.md)`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content);

    if (!fm) {
        errors.push('missing YAML frontmatter block');
    } else {
        const stem = file.replace(/\.md$/, '');
        if (fm.spec !== stem) {
            errors.push(`frontmatter "spec: ${fm.spec ?? '<missing>'}" must equal filename stem "${stem}"`);
        }
        if (nameMatch && fm.issue !== nameMatch[1]) {
            errors.push(`frontmatter "issue: ${fm.issue ?? '<missing>'}" must equal filename issue number "${nameMatch[1]}"`);
        }
        if (!STATUSES.includes(fm.status)) {
            errors.push(`frontmatter "status: ${fm.status ?? '<missing>'}" must be one of: ${STATUSES.join(' | ')}`);
        }
        if (!DATE_RE.test(fm.created ?? '')) {
            errors.push(`frontmatter "created: ${fm.created ?? '<missing>'}" must be YYYY-MM-DD`);
        }
    }

    const headings = [...content.matchAll(/^##\s+(.+)$/gm)].map(m => m[1].trim());
    for (const section of REQUIRED_SECTIONS) {
        if (!headings.some(h => h.startsWith(section))) {
            errors.push(`missing required section "## ${section}"`);
        }
    }

    const acIds = [...content.matchAll(/^\s*-\s+\*\*AC(\d+)[:*]/gm)].map(m => m[1]);
    if (acIds.length === 0) {
        errors.push('no acceptance criteria found — need at least one "- **AC1:** Given/When/Then" bullet');
    }
    const dupes = acIds.filter((id, i) => acIds.indexOf(id) !== i);
    if (dupes.length > 0) {
        errors.push(`duplicate AC IDs: ${[...new Set(dupes)].map(d => 'AC' + d).join(', ')}`);
    }

    if (fm && fm.status === 'implemented' && /\|\s*planned\s*\|/i.test(content)) {
        warnings.push('status is "implemented" but the Verification table still has "planned" rows');
    }

    return { errors, warnings };
}

// Collect files: explicit args, or every spec in docs/specs/ (README excluded)
const args = process.argv.slice(2);
let files;
if (args.length > 0) {
    files = args.map(a => path.resolve(a));
} else if (fs.existsSync(SPECS_DIR)) {
    files = fs.readdirSync(SPECS_DIR)
        .filter(f => f.endsWith('.md') && f !== 'README.md')
        .map(f => path.join(SPECS_DIR, f));
} else {
    files = [];
}

let failed = 0;
for (const filePath of files) {
    const rel = path.relative(path.join(__dirname, '..'), filePath);
    const { errors, warnings } = validateSpec(filePath);

    if (errors.length > 0) {
        failed++;
        console.error(`❌ ${rel}`);
        for (const e of errors) console.error(`   - ${e}`);
    } else {
        console.log(`✓ ${rel}`);
    }
    for (const w of warnings) console.warn(`   ⚠️  ${w}`);
}

if (failed > 0) {
    console.error(`\n❌ ${failed} of ${files.length} spec file(s) invalid. See docs/specs/README.md for the template.`);
    process.exit(1);
}
console.log(`\n✓ ${files.length} spec file(s) valid`);
