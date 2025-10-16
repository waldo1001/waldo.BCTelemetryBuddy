import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

/**
 * File-based cache with TTL support
 * Stores cache entries as JSON files in workspace .vscode/.bctb/cache/
 */
export class CacheService {
    private cacheDir: string;
    private ttlSeconds: number;
    private enabled: boolean;

    constructor(workspacePath: string, ttlSeconds: number, enabled: boolean) {
        this.cacheDir = path.join(workspacePath, '.vscode', '.bctb', 'cache');
        this.ttlSeconds = ttlSeconds;
        this.enabled = enabled;

        if (this.enabled) {
            this.ensureCacheDir();
        }
    }

    /**
     * Create cache directory if it doesn't exist
     */
    private ensureCacheDir(): void {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
                console.log(`✓ Created cache directory: ${this.cacheDir}`);
            }
        } catch (error) {
            console.error('Failed to create cache directory:', error);
        }
    }

    /**
     * Generate cache key from KQL query
     */
    private generateKey(query: string): string {
        return crypto.createHash('sha256').update(query).digest('hex');
    }

    /**
     * Get cache file path for key
     */
    private getCacheFilePath(key: string): string {
        return path.join(this.cacheDir, `${key}.json`);
    }

    /**
     * Get cached data if exists and not expired
     */
    get<T>(query: string): T | null {
        if (!this.enabled) {
            return null;
        }

        const key = this.generateKey(query);
        const filePath = this.getCacheFilePath(key);

        try {
            if (!fs.existsSync(filePath)) {
                return null;
            }

            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const entry: CacheEntry<T> = JSON.parse(fileContent);

            // Check if expired
            const age = (Date.now() - entry.timestamp) / 1000; // seconds
            if (age > entry.ttl) {
                console.log(`Cache expired for key: ${key} (age: ${Math.round(age)}s, ttl: ${entry.ttl}s)`);
                this.delete(query); // Clean up expired entry
                return null;
            }

            console.log(`✓ Cache hit for key: ${key} (age: ${Math.round(age)}s)`);
            return entry.data;
        } catch (error) {
            console.error(`Failed to read cache for key ${key}:`, error);
            return null;
        }
    }

    /**
     * Store data in cache
     */
    set<T>(query: string, data: T, ttlSeconds?: number): void {
        if (!this.enabled) {
            return;
        }

        const key = this.generateKey(query);
        const filePath = this.getCacheFilePath(key);

        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
            ttl: ttlSeconds || this.ttlSeconds
        };

        try {
            fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
            console.log(`✓ Cached data for key: ${key} (ttl: ${entry.ttl}s)`);
        } catch (error) {
            console.error(`Failed to write cache for key ${key}:`, error);
        }
    }

    /**
     * Delete cached entry
     */
    delete(query: string): void {
        if (!this.enabled) {
            return;
        }

        const key = this.generateKey(query);
        const filePath = this.getCacheFilePath(key);

        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`✓ Deleted cache for key: ${key}`);
            }
        } catch (error) {
            console.error(`Failed to delete cache for key ${key}:`, error);
        }
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        if (!this.enabled) {
            return;
        }

        try {
            const files = fs.readdirSync(this.cacheDir);

            for (const file of files) {
                if (file.endsWith('.json')) {
                    fs.unlinkSync(path.join(this.cacheDir, file));
                }
            }

            console.log(`✓ Cleared ${files.length} cache entries`);
        } catch (error) {
            console.error('Failed to clear cache:', error);
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): { totalEntries: number; expiredEntries: number; totalSizeBytes: number; cachePath: string } {
        if (!this.enabled || !fs.existsSync(this.cacheDir)) {
            return { totalEntries: 0, expiredEntries: 0, totalSizeBytes: 0, cachePath: this.cacheDir };
        }

        try {
            const files = fs.readdirSync(this.cacheDir);
            let totalEntries = 0;
            let expiredEntries = 0;
            let totalSizeBytes = 0;

            for (const file of files) {
                if (!file.endsWith('.json')) {
                    continue;
                }

                const filePath = path.join(this.cacheDir, file);
                totalEntries++;

                try {
                    const stats = fs.statSync(filePath);
                    totalSizeBytes += stats.size;

                    const fileContent = fs.readFileSync(filePath, 'utf-8');
                    const entry: CacheEntry<any> = JSON.parse(fileContent);

                    const age = (Date.now() - entry.timestamp) / 1000;
                    if (age > entry.ttl) {
                        expiredEntries++;
                    }
                } catch (error) {
                    console.error(`Failed to process cache file ${file}:`, error);
                }
            }

            return { totalEntries, expiredEntries, totalSizeBytes, cachePath: this.cacheDir };
        } catch (error) {
            console.error('Failed to get cache stats:', error);
            return { totalEntries: 0, expiredEntries: 0, totalSizeBytes: 0, cachePath: this.cacheDir };
        }
    }

    /**
     * Clean up expired cache entries
     */
    cleanupExpired(): void {
        if (!this.enabled) {
            return;
        }

        try {
            const files = fs.readdirSync(this.cacheDir);
            let cleaned = 0;

            for (const file of files) {
                if (!file.endsWith('.json')) {
                    continue;
                }

                const filePath = path.join(this.cacheDir, file);

                try {
                    const fileContent = fs.readFileSync(filePath, 'utf-8');
                    const entry: CacheEntry<any> = JSON.parse(fileContent);

                    const age = (Date.now() - entry.timestamp) / 1000;
                    if (age > entry.ttl) {
                        fs.unlinkSync(filePath);
                        cleaned++;
                    }
                } catch (error) {
                    console.error(`Failed to process cache file ${file}:`, error);
                }
            }

            if (cleaned > 0) {
                console.log(`✓ Cleaned up ${cleaned} expired cache entries`);
            }
        } catch (error) {
            console.error('Failed to cleanup expired cache:', error);
        }
    }
}
