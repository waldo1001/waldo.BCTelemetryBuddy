import axios, { AxiosInstance } from 'axios';

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

    constructor(appInsightsAppId: string, clusterUrl: string) {
        this.appInsightsAppId = appInsightsAppId;
        this.clusterUrl = clusterUrl;

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
    async executeQuery(kql: string, accessToken: string): Promise<KustoQueryResult> {
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

            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                const message = error.response?.data?.error?.message || error.message;

                console.error(`Kusto query failed (${status}):`, message);

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
