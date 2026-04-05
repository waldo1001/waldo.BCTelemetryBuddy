#!/usr/bin/env node
/**
 * Generates knowledge-base/index.json from the .md files in /knowledge-base/.
 * 
 * For each .md file it reads the YAML frontmatter and writes a compact entry:
 *   { id, title, category, tags, eventIds, appliesTo, author, created, updated }
 *
 * Run manually: node scripts/generate-kb-index.js
 * Run in CI:   node scripts/generate-kb-index.js (same command)
 */

const fs = require('fs');
const path = require('path');

const KB_DIR = path.join(__dirname, '..', 'knowledge-base');
const OUTPUT = path.join(KB_DIR, 'index.json');

const CATEGORIES = ['query-patterns', 'event-interpretations', 'playbooks', 'vendor-patterns'];

/**
 * Parses YAML frontmatter from a markdown string.
 * Returns an object with the frontmatter fields (all values as strings/arrays).
 */
function parseFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return {};

    const fm = {};
    const lines = match[1].split(/\r?\n/);

    for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;

        const key = line.slice(0, colonIdx).trim();
        const rawValue = line.slice(colonIdx + 1).trim();

        // Array value: [a, b, c]
        if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
            fm[key] = rawValue
                .slice(1, -1)
                .split(',')
                .map(v => v.trim().replace(/^["']|["']$/g, ''))
                .filter(Boolean);
        } else {
            // Strip surrounding quotes
            fm[key] = rawValue.replace(/^["']|["']$/g, '');
        }
    }

    return fm;
}

const articles = [];
let totalFiles = 0;
let skipped = 0;

for (const category of CATEGORIES) {
    const dir = path.join(KB_DIR, category);
    if (!fs.existsSync(dir)) continue;

    for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.md')) continue;
        totalFiles++;

        const slug = file.replace(/\.md$/, '');
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const fm = parseFrontmatter(content);

        if (!fm.title) {
            console.warn(`  ⚠️  Skipping ${category}/${file} — missing title in frontmatter`);
            skipped++;
            continue;
        }

        const entry = {
            id: slug,
            title: fm.title,
            category: fm.category || category.replace(/s$/, ''), // fallback: strip trailing 's'
            tags: Array.isArray(fm.tags) ? fm.tags : (fm.tags ? [fm.tags] : []),
            ...(fm.eventIds && { eventIds: Array.isArray(fm.eventIds) ? fm.eventIds : [fm.eventIds] }),
            ...(fm.appliesTo && { appliesTo: fm.appliesTo }),
            author: fm.author || 'community',
            created: fm.created || '',
            updated: fm.updated || fm.created || '',
        };

        articles.push(entry);
    }
}

// Sort: by category then by id within category
articles.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.id.localeCompare(b.id);
});

const index = {
    generated: new Date().toISOString().split('T')[0],
    count: articles.length,
    articles,
};

fs.writeFileSync(OUTPUT, JSON.stringify(index, null, 2) + '\n');

console.log(`✓ Generated knowledge-base/index.json`);
console.log(`  Articles: ${articles.length}  (${totalFiles} files scanned, ${skipped} skipped)`);
