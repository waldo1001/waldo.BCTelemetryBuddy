import axios, { AxiosInstance } from 'axios';
import * as path from 'path';
import { CacheService } from './cache.js';

/**
 * External reference configuration
 */
export interface Reference {
    name: string;
    type: 'github' | 'web';
    url: string;
    enabled: boolean;
}

/**
 * Fetched query from external reference
 */
export interface ExternalQuery {
    source: string;
    fileName: string;
    content: string;
    url: string;
}

/**
 * Service for fetching queries from external references
 * Supports GitHub API (unauthenticated, 60 req/hr)
 */
export class ReferencesService {
    private client: AxiosInstance;
    private cache: CacheService;
    private references: Reference[];
    private rateLimitRemaining: number = 60;
    private rateLimitReset: Date | null = null;

    constructor(references: Reference[], cache: CacheService) {
        this.references = references.filter(ref => ref.enabled);
        this.cache = cache;

        this.client = axios.create({
            timeout: 30000,
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'BC-Telemetry-Buddy'
            }
        });
    }

    /**
     * Get all queries from enabled external references
     */
    async getAllExternalQueries(): Promise<ExternalQuery[]> {
        const queries: ExternalQuery[] = [];

        for (const reference of this.references) {
            if (reference.type === 'github') {
                const refQueries = await this.fetchGitHubQueries(reference);
                queries.push(...refQueries);
            }
            // Web scraping skipped for v1
        }

        console.log(`✓ Fetched ${queries.length} queries from ${this.references.length} external references`);

        return queries;
    }

    /**
     * Fetch .kql files from GitHub repository
     */
    private async fetchGitHubQueries(reference: Reference): Promise<ExternalQuery[]> {
        try {
            // Check rate limit
            if (!this.checkRateLimit()) {
                console.warn(`GitHub rate limit exceeded, skipping ${reference.name}`);
                return [];
            }

            // Try cache first
            const cacheKey = `github:${reference.url}`;
            const cached = this.cache.get<ExternalQuery[]>(cacheKey);

            if (cached) {
                console.log(`✓ Using cached queries for ${reference.name}`);
                return cached;
            }

            // Parse GitHub URL
            const repoInfo = this.parseGitHubURL(reference.url);

            if (!repoInfo) {
                console.error(`Invalid GitHub URL: ${reference.url}`);
                return [];
            }

            // Fetch repository contents recursively
            const queries = await this.fetchGitHubRepoContents(
                repoInfo.owner,
                repoInfo.repo,
                repoInfo.path || '',
                reference.name
            );

            // Cache results (longer TTL for external references)
            this.cache.set(cacheKey, queries, 3600); // 1 hour

            return queries;
        } catch (error) {
            console.error(`Failed to fetch queries from ${reference.name}:`, error);
            return [];
        }
    }

    /**
     * Parse GitHub URL into owner/repo/path
     */
    private parseGitHubURL(url: string): { owner: string; repo: string; path?: string } | null {
        try {
            // Support formats:
            // - https://github.com/owner/repo
            // - https://github.com/owner/repo/tree/main/path
            const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/[^\/]+\/(.+))?/);

            if (!match) {
                return null;
            }

            return {
                owner: match[1],
                repo: match[2],
                path: match[3]
            };
        } catch {
            return null;
        }
    }

    /**
     * Recursively fetch .kql files from GitHub repository
     */
    private async fetchGitHubRepoContents(
        owner: string,
        repo: string,
        dirPath: string,
        sourceName: string
    ): Promise<ExternalQuery[]> {
        try {
            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}`;

            const response = await this.client.get(url);

            // Update rate limit info
            this.updateRateLimit(response.headers);

            const items = response.data;
            const queries: ExternalQuery[] = [];

            if (!Array.isArray(items)) {
                return [];
            }

            for (const item of items) {
                if (item.type === 'file' && item.name.endsWith('.kql')) {
                    // Fetch file content
                    const query = await this.fetchGitHubFile(item.download_url, item.name, sourceName, item.html_url);

                    if (query) {
                        queries.push(query);
                    }
                } else if (item.type === 'dir') {
                    // Recursively fetch directory contents
                    const subQueries = await this.fetchGitHubRepoContents(owner, repo, item.path, sourceName);
                    queries.push(...subQueries);
                }
            }

            return queries;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 403) {
                console.error('GitHub rate limit exceeded');
            } else {
                console.error(`Failed to fetch contents from ${owner}/${repo}/${dirPath}:`, error);
            }
            return [];
        }
    }

    /**
     * Fetch individual file content from GitHub
     */
    private async fetchGitHubFile(
        downloadUrl: string,
        fileName: string,
        sourceName: string,
        htmlUrl: string
    ): Promise<ExternalQuery | null> {
        try {
            const response = await this.client.get(downloadUrl);

            this.updateRateLimit(response.headers);

            return {
                source: sourceName,
                fileName,
                content: response.data,
                url: htmlUrl
            };
        } catch (error) {
            console.error(`Failed to fetch file ${fileName}:`, error);
            return null;
        }
    }

    /**
     * Update rate limit info from response headers
     */
    private updateRateLimit(headers: any): void {
        const remaining = headers['x-ratelimit-remaining'];
        const reset = headers['x-ratelimit-reset'];

        if (remaining !== undefined) {
            this.rateLimitRemaining = parseInt(remaining, 10);
        }

        if (reset !== undefined) {
            this.rateLimitReset = new Date(parseInt(reset, 10) * 1000);
        }

        if (this.rateLimitRemaining < 10) {
            console.warn(`GitHub rate limit low: ${this.rateLimitRemaining} requests remaining`);
        }
    }

    /**
     * Check if we can make more GitHub API requests
     */
    private checkRateLimit(): boolean {
        if (this.rateLimitRemaining <= 0) {
            if (this.rateLimitReset && this.rateLimitReset > new Date()) {
                return false;
            }
            // Reset passed, assume limit reset
            this.rateLimitRemaining = 60;
            this.rateLimitReset = null;
        }

        return true;
    }
}
