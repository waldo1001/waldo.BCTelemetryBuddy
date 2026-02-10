import axios, { AxiosInstance } from 'axios';
import { IUsageTelemetry, NoOpUsageTelemetry } from './usageTelemetry.js';

/**
 * Kusto query result structure
 */
export interface KustoQueryResult {
    tables: KustoTable[];
}

export interface KustoTable {
    tableName: string;
    columns: KustoColumn[];
    rows: any[][];
}

export interface KustoColumn {
    columnName: string;
    dataType: string;
    columnType: string;
}

/**
 * Kusto query service for Application Insights
 * Executes KQL queries against Azure Data Explorer
 */
export class KustoService {
    private client: AxiosInstance;
    private appInsightsAppId: string;
    private clusterUrl: string;
    private usageTelemetry: IUsageTelemetry;

    constructor(appInsightsAppId: string, clusterUrl: string, usageTelemetry?: IUsageTelemetry) {
        this.appInsightsAppId = appInsightsAppId;
        this.clusterUrl = clusterUrl;
        this.usageTelemetry = usageTelemetry || new NoOpUsageTelemetry();

        this.client = axios.create({
            timeout: 60000, // 60 second timeout for queries
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Execute KQL query against Application Insights
     */
    async executeQuery(
        kql: string,
        accessToken: string,
        queryName?: string,
        correlationId?: string
    ): Promise<KustoQueryResult> {
        const startTime = Date.now();
        const safeName = queryName || 'AdHocQuery'; // Never log raw KQL

        try {
            // Use correct Application Insights API endpoint
            // The clusterUrl from settings is ignored - we always use the standard API endpoint
            const url = `https://api.applicationinsights.io/v1/apps/${this.appInsightsAppId}/query`;

            console.log(`Executing KQL query against: ${url}`);

            const response = await this.client.post<KustoQueryResult>(
                url,
                { query: kql },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                }
            );

            console.log(`✓ Query executed successfully, ${response.data.tables.length} table(s) returned`);

            // Track successful dependency call
            const durationMs = Date.now() - startTime;
            this.usageTelemetry.trackDependency(
                'Kusto',
                url,  // Use actual URL instead of query name to prevent "Failed to create URL" error
                durationMs,
                true,
                '200',
                {
                    component: 'shared',
                    correlationId: correlationId || 'unknown',
                    cacheHit: 'false',
                    queryName: safeName  // Move query name to properties
                }
            );

            return response.data;
        } catch (error) {
            const durationMs = Date.now() - startTime;

            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                const message = error.response?.data?.error?.message || error.message;

                console.error(`Kusto query failed (${status}):`, message);

                // Track failed dependency call
                const url = `https://api.applicationinsights.io/v1/apps/${this.appInsightsAppId}/query`;
                this.usageTelemetry.trackDependency(
                    'Kusto',
                    url,  // Use actual URL instead of query name to prevent "Failed to create URL" error
                    durationMs,
                    false,
                    String(status || 'error'),
                    {
                        component: 'shared',
                        correlationId: correlationId || 'unknown',
                        queryName: safeName,  // Move query name to properties
                        errorCategory: status === 400 ? 'InvalidQuery' :
                            status === 401 || status === 403 ? 'AuthenticationError' :
                                status === 429 ? 'RateLimitExceeded' : 'Unknown'
                    }
                );

                // Provide helpful error messages
                if (status === 401 || status === 403) {
                    throw new Error(`Authentication failed: ${message}. Check your credentials and permissions.`);
                } else if (status === 400) {
                    throw new Error(`Invalid query: ${message}`);
                } else if (status === 429) {
                    throw new Error(`Rate limit exceeded: ${message}. Please try again later.`);
                } else {
                    throw new Error(`Query execution failed: ${message}`);
                }
            }

            // Track failed dependency call for non-axios errors
            const url = `https://api.applicationinsights.io/v1/apps/${this.appInsightsAppId}/query`;
            this.usageTelemetry.trackDependency(
                'Kusto',
                url,  // Use actual URL instead of query name to prevent "Failed to create URL" error
                durationMs,
                false,
                'error',
                {
                    component: 'shared',
                    correlationId: correlationId || 'unknown',
                    queryName: safeName,  // Move query name to properties
                    errorCategory: 'Unknown'
                }
            );

            throw error;
        }
    }

    /**
     * Validate KQL query syntax (basic check)
     * Returns validation errors if any
     */
    validateQuery(kql: string): string[] {
        const errors: string[] = [];

        if (!kql || kql.trim().length === 0) {
            errors.push('Query cannot be empty');
            return errors;
        }

        // Check for dangerous operations (non-exhaustive, basic safety)
        const dangerousKeywords = ['.drop', '.delete', '.clear', '.set-or-replace'];
        const lowerKql = kql.toLowerCase();

        for (const keyword of dangerousKeywords) {
            if (lowerKql.includes(keyword)) {
                errors.push(`Query contains potentially dangerous operation: ${keyword}`);
            }
        }

        return errors;
    }

    /**
     * Parse query result into simplified structure for LLM/UI
     */
    parseResult(result: KustoQueryResult): {
        columns: string[];
        rows: any[][];
        summary: string;
    } {
        if (!result.tables || result.tables.length === 0) {
            return {
                columns: [],
                rows: [],
                summary: 'No results returned'
            };
        }

        const primaryTable = result.tables[0];
        const columns = primaryTable.columns.map(col => col.columnName);
        const rows = primaryTable.rows;

        const summary = `Returned ${rows.length} row(s) with ${columns.length} column(s)`;

        return { columns, rows, summary };
    }
}
