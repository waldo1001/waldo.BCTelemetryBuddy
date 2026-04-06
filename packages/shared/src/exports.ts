import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Export file metadata
 */
export interface ExportFileInfo {
    filePath: string;
    fileUri: string;
    mimeType: string;
    filename: string;
}

/**
 * Export listing entry
 */
export interface ExportListEntry {
    filename: string;
    uri: string;
    mimeType: string;
    createdAt: Date;
    sizeBytes: number;
}

/**
 * Convert tabular data (columns + rows) to CSV string with proper escaping.
 * Handles commas, quotes, newlines, nulls, and undefined values.
 */
export function convertToCsv(columns: string[], rows: any[][]): string {
    const escapeCsv = (val: any): string => {
        if (val === null || val === undefined) {
            return '';
        }
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const header = columns.map(escapeCsv).join(',');
    const dataRows = rows.map(row => row.map(escapeCsv).join(','));
    return [header, ...dataRows].join('\n');
}

/**
 * Default max age for exports: 24 hours
 */
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Service for exporting tool results to files.
 * Manages the exports directory at {workspacePath}/.vscode/.bctb/exports/
 *
 * Used by MCP tools with resultFormat: 'resource' to return data as
 * embedded MCP resources instead of inline text.
 */
export class ExportService {
    private exportsDir: string;

    constructor(workspacePath: string) {
        this.exportsDir = path.join(workspacePath, '.vscode', '.bctb', 'exports');
    }

    /**
     * Get the exports directory path
     */
    getExportsDir(): string {
        return this.exportsDir;
    }

    /**
     * Create exports directory if it doesn't exist
     */
    private ensureExportsDir(): void {
        try {
            if (!fs.existsSync(this.exportsDir)) {
                fs.mkdirSync(this.exportsDir, { recursive: true });
            }
        } catch (error) {
            console.error('Failed to create exports directory:', error);
        }
    }

    /**
     * Generate a unique export filename.
     * Pattern: {toolName}_{YYYYMMDD_HHmmss}_{8charHash}.{ext}
     */
    private generateFilename(toolName: string, extension: string): string {
        const now = new Date();
        const timestamp = now.toISOString()
            .replace(/[-:T]/g, '')
            .replace(/\.\d+Z$/, '')
            .replace(/(\d{8})(\d{6})/, '$1_$2');
        const hash = crypto.randomBytes(4).toString('hex');
        return `${toolName}_${timestamp}_${hash}.${extension}`;
    }

    /**
     * Export data as JSON file.
     */
    exportJson(data: any, toolName: string): ExportFileInfo {
        this.ensureExportsDir();

        const filename = this.generateFilename(toolName, 'json');
        const filePath = path.join(this.exportsDir, filename);
        const content = JSON.stringify(data, null, 2);

        fs.writeFileSync(filePath, content, 'utf-8');

        return {
            filePath,
            fileUri: `file://${filePath}`,
            mimeType: 'application/json',
            filename
        };
    }

    /**
     * Export tabular data as CSV file.
     * Takes columns and rows as already parsed by KustoService.parseResult().
     */
    exportCsv(columns: string[], rows: any[][], toolName: string): ExportFileInfo {
        this.ensureExportsDir();

        const filename = this.generateFilename(toolName, 'csv');
        const filePath = path.join(this.exportsDir, filename);
        const content = convertToCsv(columns, rows);

        fs.writeFileSync(filePath, content, 'utf-8');

        return {
            filePath,
            fileUri: `file://${filePath}`,
            mimeType: 'text/csv',
            filename
        };
    }

    /**
     * List all exported files.
     */
    listExports(): ExportListEntry[] {
        try {
            if (!fs.existsSync(this.exportsDir)) {
                return [];
            }

            const files = fs.readdirSync(this.exportsDir);
            const entries: ExportListEntry[] = [];

            for (const filename of files) {
                if (!filename.endsWith('.json') && !filename.endsWith('.csv')) {
                    continue;
                }

                const filePath = path.join(this.exportsDir, filename);

                try {
                    const stat = fs.statSync(filePath);
                    const mimeType = filename.endsWith('.csv') ? 'text/csv' : 'application/json';
                    entries.push({
                        filename,
                        uri: `file://${filePath}`,
                        mimeType,
                        createdAt: stat.birthtime,
                        sizeBytes: stat.size
                    });
                } catch {
                    // Skip files that can't be stat'd
                }
            }

            // Sort by creation time, newest first
            entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            return entries;
        } catch {
            return [];
        }
    }

    /**
     * Read an exported file by filename.
     */
    readExport(filename: string): { content: string; mimeType: string } | null {
        const filePath = path.join(this.exportsDir, filename);

        // Prevent path traversal
        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(path.resolve(this.exportsDir))) {
            return null;
        }

        try {
            if (!fs.existsSync(filePath)) {
                return null;
            }
            const content = fs.readFileSync(filePath, 'utf-8');
            const mimeType = filename.endsWith('.csv') ? 'text/csv' : 'application/json';
            return { content, mimeType };
        } catch {
            return null;
        }
    }

    /**
     * Clean up exported files older than maxAgeMs (default: 24 hours).
     */
    cleanupExpired(maxAgeMs: number = DEFAULT_MAX_AGE_MS): number {
        try {
            if (!fs.existsSync(this.exportsDir)) {
                return 0;
            }

            const files = fs.readdirSync(this.exportsDir);
            let cleaned = 0;
            const now = Date.now();

            for (const filename of files) {
                if (!filename.endsWith('.json') && !filename.endsWith('.csv')) {
                    continue;
                }

                const filePath = path.join(this.exportsDir, filename);

                try {
                    const stat = fs.statSync(filePath);
                    if (now - stat.birthtimeMs > maxAgeMs) {
                        fs.unlinkSync(filePath);
                        cleaned++;
                    }
                } catch {
                    // Skip files that can't be processed
                }
            }

            if (cleaned > 0) {
                console.log(`✓ Cleaned up ${cleaned} expired export files`);
            }

            return cleaned;
        } catch {
            return 0;
        }
    }
}
