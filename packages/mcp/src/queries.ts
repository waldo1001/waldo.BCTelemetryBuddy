import * as fs from 'fs';
import * as path from 'path';

/**
 * Saved query metadata
 */
export interface SavedQuery {
    filePath: string;
    fileName: string;
    name: string;
    purpose: string;
    useCase: string;
    created: string;
    tags: string[];
    kql: string;
}

/**
 * Service for managing saved .kql query files
 */
export class QueriesService {
    private queriesDir: string;

    constructor(workspacePath: string) {
        this.queriesDir = path.join(workspacePath, '.vscode', '.bctb', 'queries');
        this.ensureQueriesDir();
    }

    /**
     * Create queries directory if it doesn't exist
     */
    private ensureQueriesDir(): void {
        try {
            if (!fs.existsSync(this.queriesDir)) {
                fs.mkdirSync(this.queriesDir, { recursive: true });
                console.log(`✓ Created queries directory: ${this.queriesDir}`);
            }
        } catch (error) {
            console.error('Failed to create queries directory:', error);
        }
    }

    /**
     * Get all saved queries
     */
    getAllQueries(): SavedQuery[] {
        try {
            if (!fs.existsSync(this.queriesDir)) {
                return [];
            }

            const files = fs.readdirSync(this.queriesDir);
            const queries: SavedQuery[] = [];

            for (const file of files) {
                if (!file.endsWith('.kql')) {
                    continue;
                }

                const filePath = path.join(this.queriesDir, file);
                const query = this.parseQueryFile(filePath);

                if (query) {
                    queries.push(query);
                }
            }

            console.log(`✓ Loaded ${queries.length} saved queries`);
            return queries;
        } catch (error) {
            console.error('Failed to load saved queries:', error);
            return [];
        }
    }

    /**
     * Parse .kql file and extract metadata from comments
     */
    private parseQueryFile(filePath: string): SavedQuery | null {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');

            const metadata: Partial<SavedQuery> = {
                filePath,
                fileName: path.basename(filePath),
                tags: []
            };

            let kqlStartLine = 0;

            // Parse comment headers
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                if (!line.startsWith('//')) {
                    kqlStartLine = i;
                    break;
                }

                const commentContent = line.substring(2).trim();

                // Parse structured comments
                if (commentContent.startsWith('Query:')) {
                    metadata.name = commentContent.substring(6).trim();
                } else if (commentContent.startsWith('Purpose:')) {
                    metadata.purpose = commentContent.substring(8).trim();
                } else if (commentContent.startsWith('Use case:')) {
                    metadata.useCase = commentContent.substring(9).trim();
                } else if (commentContent.startsWith('Created:')) {
                    metadata.created = commentContent.substring(8).trim();
                } else if (commentContent.startsWith('Tags:')) {
                    const tagsStr = commentContent.substring(5).trim();
                    metadata.tags = tagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);
                }
            }

            // Extract KQL (everything after comments)
            const kql = lines.slice(kqlStartLine).join('\n').trim();

            if (!kql) {
                console.warn(`No KQL found in ${filePath}`);
                return null;
            }

            return {
                filePath: metadata.filePath!,
                fileName: metadata.fileName!,
                name: metadata.name || metadata.fileName!,
                purpose: metadata.purpose || '',
                useCase: metadata.useCase || '',
                created: metadata.created || '',
                tags: metadata.tags!,
                kql
            };
        } catch (error) {
            console.error(`Failed to parse query file ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Search queries by content, filename, or metadata
     * Returns matching queries for LLM context
     */
    searchQueries(searchTerms: string[]): SavedQuery[] {
        const allQueries = this.getAllQueries();

        if (!searchTerms || searchTerms.length === 0) {
            return allQueries;
        }

        const matches: SavedQuery[] = [];

        for (const query of allQueries) {
            let score = 0;

            // Check each search term
            for (const term of searchTerms) {
                const lowerTerm = term.toLowerCase();

                // Search in various fields
                if (query.name.toLowerCase().includes(lowerTerm)) {
                    score += 10; // High weight for name match
                }

                if (query.purpose.toLowerCase().includes(lowerTerm)) {
                    score += 5;
                }

                if (query.useCase.toLowerCase().includes(lowerTerm)) {
                    score += 5;
                }

                if (query.tags.some(tag => tag.toLowerCase().includes(lowerTerm))) {
                    score += 8; // High weight for tag match
                }

                if (query.fileName.toLowerCase().includes(lowerTerm)) {
                    score += 7;
                }

                if (query.kql.toLowerCase().includes(lowerTerm)) {
                    score += 3; // Lower weight for KQL content match
                }
            }

            if (score > 0) {
                matches.push(query);
            }
        }

        // Sort by relevance (score)
        matches.sort((a, b) => {
            // Recalculate scores for sorting (not optimal but keeps logic clear)
            const scoreA = this.calculateScore(a, searchTerms);
            const scoreB = this.calculateScore(b, searchTerms);
            return scoreB - scoreA;
        });

        console.log(`✓ Found ${matches.length} queries matching search terms: ${searchTerms.join(', ')}`);

        return matches;
    }

    /**
     * Calculate relevance score for query
     */
    private calculateScore(query: SavedQuery, searchTerms: string[]): number {
        let score = 0;

        for (const term of searchTerms) {
            const lowerTerm = term.toLowerCase();

            if (query.name.toLowerCase().includes(lowerTerm)) score += 10;
            if (query.purpose.toLowerCase().includes(lowerTerm)) score += 5;
            if (query.useCase.toLowerCase().includes(lowerTerm)) score += 5;
            if (query.tags.some(tag => tag.toLowerCase().includes(lowerTerm))) score += 8;
            if (query.fileName.toLowerCase().includes(lowerTerm)) score += 7;
            if (query.kql.toLowerCase().includes(lowerTerm)) score += 3;
        }

        return score;
    }

    /**
     * Save new query to .kql file
     */
    saveQuery(name: string, kql: string, purpose?: string, useCase?: string, tags?: string[]): string {
        try {
            // Generate filename from name
            const fileName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.kql';
            const filePath = path.join(this.queriesDir, fileName);

            // Build file content with formatted comments
            const lines: string[] = [];

            lines.push(`// Query: ${name}`);
            if (purpose) {
                lines.push(`// Purpose: ${purpose}`);
            }
            if (useCase) {
                lines.push(`// Use case: ${useCase}`);
            }
            lines.push(`// Created: ${new Date().toISOString().split('T')[0]}`); // YYYY-MM-DD
            if (tags && tags.length > 0) {
                lines.push(`// Tags: ${tags.join(', ')}`);
            }
            lines.push('');
            lines.push(kql);

            const content = lines.join('\n');

            fs.writeFileSync(filePath, content, 'utf-8');

            console.log(`✓ Saved query to: ${filePath}`);

            return filePath;
        } catch (error) {
            console.error('Failed to save query:', error);
            throw error;
        }
    }
}
