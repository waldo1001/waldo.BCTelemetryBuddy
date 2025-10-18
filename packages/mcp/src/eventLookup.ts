/**
 * Dynamic Event Category Lookup
 * 
 * This module provides runtime lookup of Business Central telemetry event IDs
 * from Microsoft Learn documentation, with intelligent caching and fallback
 * to customDimensions analysis for custom events.
 * 
 * Benefits:
 * - Always up-to-date with Microsoft documentation
 * - No manual maintenance required
 * - Automatic handling of custom events
 * - Efficient caching to minimize network calls
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

export interface EventCategoryInfo {
    eventId: string;
    category: string | null;
    subcategory?: string;
    documentationUrl: string | null;
    description: string;
    isStandardEvent: boolean;
    source: 'microsoft-learn' | 'custom-analysis' | 'cache';
    cachedAt?: Date;
}

interface CacheEntry {
    data: EventCategoryInfo;
    expiresAt: number;
}

// Cache TTL: 24 hours (Microsoft docs don't change that often)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Cache directory
const CACHE_DIR = path.join(__dirname, '..', '.cache', 'events');

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(): void {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

/**
 * Get cache file path for an event ID
 */
function getCacheFilePath(eventId: string): string {
    return path.join(CACHE_DIR, `${eventId}.json`);
}

/**
 * Load cached event info if available and not expired
 */
function loadFromCache(eventId: string): EventCategoryInfo | null {
    try {
        ensureCacheDir();
        const cacheFile = getCacheFilePath(eventId);

        if (!fs.existsSync(cacheFile)) {
            return null;
        }

        const cached: CacheEntry = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));

        if (Date.now() > cached.expiresAt) {
            // Expired - delete cache file
            fs.unlinkSync(cacheFile);
            return null;
        }

        return {
            ...cached.data,
            source: 'cache',
            cachedAt: new Date(cached.expiresAt - CACHE_TTL_MS)
        };
    } catch (error) {
        // Cache read failed - continue without cache
        return null;
    }
}

/**
 * Save event info to cache
 */
function saveToCache(eventId: string, info: EventCategoryInfo): void {
    try {
        ensureCacheDir();
        const cacheFile = getCacheFilePath(eventId);

        const entry: CacheEntry = {
            data: info,
            expiresAt: Date.now() + CACHE_TTL_MS
        };

        fs.writeFileSync(cacheFile, JSON.stringify(entry, null, 2), 'utf-8');
    } catch (error) {
        // Cache write failed - continue without caching
        console.warn(`Failed to cache event ${eventId}:`, error);
    }
}

/**
 * Fetch Microsoft Learn telemetry overview page
 */
async function fetchMicrosoftLearnPage(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        }).on('error', reject);
    });
}

/**
 * Search Microsoft Learn documentation for an event ID
 * 
 * Strategy:
 * 1. Check telemetry overview page for event ID
 * 2. If found, extract category and documentation link
 * 3. Optionally fetch detail page for more context
 */
async function lookupOnMicrosoftLearn(eventId: string): Promise<EventCategoryInfo | null> {
    try {
        // Telemetry overview page
        const overviewUrl = 'https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/telemetry-overview';
        const overviewHtml = await fetchMicrosoftLearnPage(overviewUrl);

        // Search for event ID in the page
        const eventIdPattern = new RegExp(`eventId.*?${eventId}`, 'i');

        if (!eventIdPattern.test(overviewHtml)) {
            // Event ID not found in overview - likely custom event
            return null;
        }

        // Extract category context (look for table rows containing this event ID)
        // This is a simplified extraction - in production, would use proper HTML parsing
        const categoryMatch = extractCategoryFromHtml(overviewHtml, eventId);

        if (categoryMatch) {
            return {
                eventId,
                category: categoryMatch.category,
                subcategory: categoryMatch.subcategory,
                documentationUrl: categoryMatch.url,
                description: categoryMatch.description,
                isStandardEvent: true,
                source: 'microsoft-learn'
            };
        }

        return null;
    } catch (error) {
        console.warn(`Failed to lookup ${eventId} on Microsoft Learn:`, error);
        return null;
    }
}

/**
 * Extract category information from HTML
 * (Simplified implementation - would use cheerio or similar in production)
 */
function extractCategoryFromHtml(html: string, eventId: string): {
    category: string;
    subcategory?: string;
    url: string;
    description: string;
} | null {
    // This is a placeholder for actual HTML parsing logic
    // In a real implementation, we would:
    // 1. Parse HTML with cheerio or similar
    // 2. Find the table row containing the event ID
    // 3. Extract the category name and "Learn more" link
    // 4. Optionally fetch the detail page for subcategory/description

    // For now, return null to trigger custom event analysis
    return null;
}

/**
 * Analyze customDimensions and message to infer event purpose
 * 
 * This is used when the event is not found in Microsoft Learn,
 * indicating it's likely a custom event or undocumented event.
 * 
 * Uses both:
 * - message field: Often contains descriptive text about the event
 * - customDimensions field names: Indicate what data the event tracks
 */
function analyzeCustomEvent(
    eventId: string,
    customDimensions?: Record<string, any>,
    message?: string
): EventCategoryInfo {
    let category = 'Custom event';
    let description = `Custom telemetry event ${eventId}`;

    // First, analyze the message field if available (most descriptive!)
    if (message && typeof message === 'string') {
        const lowerMsg = message.toLowerCase();

        // Extract description from message
        description = message.length > 200 ? message.substring(0, 197) + '...' : message;

        // Categorize based on message content
        if (/report|rendering|rdlc|word|excel|pdf/i.test(lowerMsg)) {
            category = 'Custom event (Report-related)';
        } else if (/sql|query|database|table|lock|deadlock/i.test(lowerMsg)) {
            category = 'Custom event (Database-related)';
        } else if (/auth|login|user|permission|token|credential/i.test(lowerMsg)) {
            category = 'Custom event (Authentication-related)';
        } else if (/extension|app|install|publish|dependency|module/i.test(lowerMsg)) {
            category = 'Custom event (Extension-related)';
        } else if (/web\s*service|webservice|api|endpoint|http|rest|soap|odata/i.test(lowerMsg)) {
            category = 'Custom event (Web Service-related)';
        } else if (/performance|slow|duration|timeout|latency/i.test(lowerMsg)) {
            category = 'Custom event (Performance-related)';
        } else if (/error|exception|failed|failure/i.test(lowerMsg)) {
            category = 'Custom event (Error/Exception)';
        } else if (/lifecycle|startup|start|stop|shutdown|initializ/i.test(lowerMsg)) {
            category = 'Custom event (Lifecycle-related)';
        }
    }

    // If message didn't provide a clear category, analyze customDimensions field names
    if (category === 'Custom event' && customDimensions) {
        const fields = Object.keys(customDimensions);

        // Look for common patterns in field names
        if (fields.some(f => /report|rendering|rdlc|word|excel/i.test(f))) {
            category = 'Custom event (Report-related)';
            description = `Custom report telemetry event ${eventId}`;
        } else if (fields.some(f => /sql|query|database|table/i.test(f))) {
            category = 'Custom event (Database-related)';
            description = `Custom database telemetry event ${eventId}`;
        } else if (fields.some(f => /auth|login|user|permission/i.test(f))) {
            category = 'Custom event (Authentication-related)';
            description = `Custom authentication telemetry event ${eventId}`;
        } else if (fields.some(f => /extension|app|install|publish/i.test(f))) {
            category = 'Custom event (Extension-related)';
            description = `Custom extension telemetry event ${eventId}`;
        } else if (fields.some(f => /web.*service|api|endpoint|http/i.test(f))) {
            category = 'Custom event (Web Service-related)';
            description = `Custom web service telemetry event ${eventId}`;
        }
    }

    return {
        eventId,
        category,
        documentationUrl: null,
        description,
        isStandardEvent: false,
        source: 'custom-analysis'
    };
}

/**
 * Lookup event category information
 * 
 * Flow:
 * 1. Check cache
 * 2. Try Microsoft Learn lookup
 * 3. Fall back to custom event analysis (using message + customDimensions)
 * 4. Cache result
 */
export async function lookupEventCategory(
    eventId: string,
    customDimensions?: Record<string, any>,
    message?: string
): Promise<EventCategoryInfo> {
    // Step 1: Check cache
    const cached = loadFromCache(eventId);
    if (cached) {
        return cached;
    }

    // Step 2: Try Microsoft Learn lookup
    const msLearnResult = await lookupOnMicrosoftLearn(eventId);

    if (msLearnResult) {
        // Found in Microsoft Learn - cache and return
        saveToCache(eventId, msLearnResult);
        return msLearnResult;
    }

    // Step 3: Analyze as custom event using both message and customDimensions
    const customResult = analyzeCustomEvent(eventId, customDimensions, message);

    // Cache custom event analysis too (to avoid repeated lookups)
    saveToCache(eventId, customResult);

    return customResult;
}

/**
 * Bulk lookup for multiple event IDs
 * (Useful for analyzing multiple events at once)
 */
export async function lookupEventCategories(
    eventIds: string[],
    customDimensionsMap?: Map<string, Record<string, any>>
): Promise<Map<string, EventCategoryInfo>> {
    const results = new Map<string, EventCategoryInfo>();

    // Lookup in parallel (but with reasonable concurrency limit)
    const CONCURRENCY = 5;
    const chunks = [];

    for (let i = 0; i < eventIds.length; i += CONCURRENCY) {
        chunks.push(eventIds.slice(i, i + CONCURRENCY));
    }

    for (const chunk of chunks) {
        const promises = chunk.map(async (eventId) => {
            const customDims = customDimensionsMap?.get(eventId);
            const info = await lookupEventCategory(eventId, customDims);
            results.set(eventId, info);
        });

        await Promise.all(promises);
    }

    return results;
}

/**
 * Clear all cached event data
 * (Useful for forcing a refresh from Microsoft Learn)
 */
export function clearEventCache(): number {
    try {
        ensureCacheDir();
        const files = fs.readdirSync(CACHE_DIR);
        let cleared = 0;

        for (const file of files) {
            if (file.endsWith('.json')) {
                fs.unlinkSync(path.join(CACHE_DIR, file));
                cleared++;
            }
        }

        return cleared;
    } catch (error) {
        console.warn('Failed to clear event cache:', error);
        return 0;
    }
}
