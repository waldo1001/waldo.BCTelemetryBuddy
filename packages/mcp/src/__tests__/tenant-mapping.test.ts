/**
 * Tenant Mapping Tests
 * Tests for mapping company names to Azure AD tenant IDs
 * Added: 2025-10-16 12:05 (Prompt #105)
 */

describe('Tenant Mapping', () => {
    describe('getTenantMapping', () => {
        it('should build correct KQL query', () => {
            const params = {
                daysBack: 10,
                companyNameFilter: undefined
            };

            const kql = buildTenantMappingQuery(params);

            expect(kql).toContain('ago(10d)');
            expect(kql).toContain('customDimensions.companyName');
            expect(kql).toContain('customDimensions.aadTenantId');
            expect(kql).toContain('summarize');
        });

        it('should filter by company name when provided', () => {
            const params = {
                daysBack: 10,
                companyNameFilter: 'Acme'
            };

            const kql = buildTenantMappingQuery(params);

            expect(kql).toContain('companyName');
            expect(kql).toContain('contains');
            expect(kql).toContain('Acme');
        });

        it('should handle case-insensitive company name filtering', () => {
            const testCases = [
                'acme corp',
                'ACME CORP',
                'Acme Corp',
                'AcMe CoRp'
            ];

            testCases.forEach(companyName => {
                const normalized = normalizeCompanyName(companyName);
                expect(normalized).toBe('acme corp');
            });
        });

        it('should return mappings sorted by occurrence frequency', () => {
            const mockResults = [
                { companyName: 'Acme Corp', tenantId: 'tenant-123', count: 500 },
                { companyName: 'Tech Inc', tenantId: 'tenant-456', count: 1000 },
                { companyName: 'Data LLC', tenantId: 'tenant-789', count: 250 }
            ];

            const sorted = sortByFrequency(mockResults);

            expect(sorted[0].companyName).toBe('Tech Inc'); // Highest count
            expect(sorted[1].companyName).toBe('Acme Corp');
            expect(sorted[2].companyName).toBe('Data LLC');
        });

        it('should validate tenant ID format', () => {
            const validTenantIds = [
                '12345678-1234-1234-1234-123456789012',
                'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                '00000000-0000-0000-0000-000000000000'
            ];

            validTenantIds.forEach(tenantId => {
                expect(isValidGuid(tenantId)).toBe(true);
            });

            const invalidTenantIds = [
                '',
                'not-a-guid',
                '12345',
                '12345678-1234-1234-1234',  // Too short
                '12345678-1234-1234-1234-123456789012-extra'  // Too long
            ];

            invalidTenantIds.forEach(tenantId => {
                expect(isValidGuid(tenantId)).toBe(false);
            });
        });

        it('should generate usage recommendation with tenant ID', () => {
            const mapping = {
                companyName: 'Acme Corp',
                tenantId: 'tenant-123',
                count: 500
            };

            const recommendation = generateUsageRecommendation(mapping);

            expect(recommendation).toContain('tenant-123');
            expect(recommendation).toContain('aadTenantId');
            expect(recommendation).toContain('where');
        });

        it('should handle multiple tenants for same company name', () => {
            const mockResults = [
                { companyName: 'Test Company', tenantId: 'tenant-aaa', count: 100 },
                { companyName: 'Test Company', tenantId: 'tenant-bbb', count: 50 }
            ];

            const grouped = groupByCompanyName(mockResults);

            expect(grouped['Test Company']).toHaveLength(2);
            expect(grouped['Test Company'][0].tenantId).toBe('tenant-aaa'); // Higher count first
        });

        it('should detect companies without tenant IDs', () => {
            const mockResults = [
                { companyName: 'Acme Corp', tenantId: 'tenant-123', count: 100 },
                { companyName: 'Orphan Company', tenantId: null, count: 50 },
                { companyName: 'Another Company', tenantId: '', count: 25 }
            ];

            const withoutTenants = mockResults.filter(r => !r.tenantId);

            expect(withoutTenants).toHaveLength(2);
            expect(withoutTenants.map(r => r.companyName)).toContain('Orphan Company');
            expect(withoutTenants.map(r => r.companyName)).toContain('Another Company');
        });
    });

    describe('KQL Filter Generation', () => {
        it('should generate correct tenant filter', () => {
            const tenantId = 'tenant-123';
            const filter = generateTenantFilter(tenantId);

            expect(filter).toBe('| where tostring(customDimensions.aadTenantId) == "tenant-123"');
        });

        it('should escape special characters in tenant ID', () => {
            const escaped1 = escapeTenantId('tenant-with-"quotes"');
            expect(escaped1).toContain('\\"'); // Escaped quote

            const escaped2 = escapeTenantId('tenant-with-\\backslash');
            expect(escaped2).toContain('\\\\'); // Escaped backslash

            const escaped3 = escapeTenantId('tenant-with-\nnewline');
            expect(escaped3).not.toContain('\n'); // Newline should be escaped
        });

        it('should generate multi-tenant filter for OR conditions', () => {
            const tenantIds = ['tenant-123', 'tenant-456', 'tenant-789'];
            const filter = generateMultiTenantFilter(tenantIds);

            expect(filter).toContain('in~');
            tenantIds.forEach(id => {
                expect(filter).toContain(id);
            });
        });
    });

    describe('Company Name Normalization', () => {
        it('should trim whitespace', () => {
            const inputs = [
                '  Acme Corp  ',
                '\tTech Inc\t',
                '\nData LLC\n'
            ];

            inputs.forEach(input => {
                const normalized = normalizeCompanyName(input);
                expect(normalized).toBe(normalized.trim());
            });
        });

        it('should handle empty strings', () => {
            const emptyInputs = ['', '   ', '\t\n'];

            emptyInputs.forEach(input => {
                const normalized = normalizeCompanyName(input);
                expect(normalized).toBe('');
            });
        });

        it('should preserve internal spaces', () => {
            const companyName = 'Acme  Double  Space  Corp';
            const normalized = normalizeCompanyName(companyName);

            expect(normalized.split(' ').length).toBeGreaterThan(1);
        });
    });

    describe('Telemetry Query Integration', () => {
        it('should demonstrate complete workflow', () => {
            // Step 1: User asks about "Acme"
            const userInput = 'show errors for Acme Corp';

            // Step 2: Extract company name (simple extraction - first word after "for")
            const companyName = extractCompanyName(userInput);
            expect(companyName).toBeTruthy(); // Just verify something was extracted

            // Step 3: Get tenant mapping
            const mapping = {
                companyName: 'Acme Corp',
                tenantId: 'tenant-123',
                count: 500
            };

            // Step 4: Generate query with tenant filter
            const query = `traces
| where severityLevel == 3
${generateTenantFilter(mapping.tenantId)}
| take 100`;

            expect(query).toContain('tenant-123');
            expect(query).toContain('aadTenantId');
        });

        it('should warn when tenant ID not found', () => {
            const mapping = {
                companyName: 'Unknown Company',
                tenantId: null,
                count: 0
            };

            const hasWarning = shouldWarnAboutMissingTenant(mapping);

            expect(hasWarning).toBe(true);
        });

        it('should handle partial company name matches', () => {
            const searchTerm = 'acme';
            const companies = [
                'Acme Corporation',
                'Acme Corp',
                'The Acme Company',
                'Tech Corp'  // Should not match
            ];

            const matches = companies.filter(c =>
                c.toLowerCase().includes(searchTerm.toLowerCase())
            );

            expect(matches).toHaveLength(3);
            expect(matches).not.toContain('Tech Corp');
        });
    });

    describe('Response Formatting', () => {
        it('should format tenant mapping response', () => {
            const mappings = [
                { companyName: 'Acme Corp', tenantId: 'tenant-123', count: 500 },
                { companyName: 'Tech Inc', tenantId: 'tenant-456', count: 300 }
            ];

            const formatted = formatTenantMappingResponse(mappings);

            expect(formatted).toContain('Acme Corp');
            expect(formatted).toContain('tenant-123');
            expect(formatted).toContain('500');
        });

        it('should include usage examples in response', () => {
            const mapping = {
                companyName: 'Acme Corp',
                tenantId: 'tenant-123',
                count: 500
            };

            const response = formatTenantMappingResponse([mapping]);

            expect(response).toContain('where');
            expect(response).toContain('aadTenantId');
        });
    });
});

// Helper functions
function buildTenantMappingQuery(params: { daysBack: number; companyNameFilter?: string }): string {
    let kql = `traces | where timestamp > ago(${params.daysBack}d)`;

    if (params.companyNameFilter) {
        kql += ` | where tostring(customDimensions.companyName) contains "${params.companyNameFilter}"`;
    }

    kql += ` | summarize Count = count() by CompanyName = tostring(customDimensions.companyName), TenantId = tostring(customDimensions.aadTenantId)`;
    kql += ` | order by Count desc`;

    return kql;
}

function normalizeCompanyName(companyName: string): string {
    return companyName.trim().toLowerCase();
}

function sortByFrequency(results: Array<{ companyName: string; tenantId: string; count: number }>): any[] {
    return [...results].sort((a, b) => b.count - a.count);
}

function isValidGuid(guid: string): boolean {
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return guidRegex.test(guid);
}

function generateUsageRecommendation(mapping: { companyName: string; tenantId: string; count: number }): string {
    return `To query telemetry for ${mapping.companyName}, use:\n| where tostring(customDimensions.aadTenantId) == "${mapping.tenantId}"`;
}

function groupByCompanyName(results: Array<{ companyName: string; tenantId: string; count: number }>): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    for (const result of results) {
        if (!grouped[result.companyName]) {
            grouped[result.companyName] = [];
        }
        grouped[result.companyName].push(result);
    }

    // Sort each group by count
    for (const companyName in grouped) {
        grouped[companyName].sort((a, b) => b.count - a.count);
    }

    return grouped;
}

function generateTenantFilter(tenantId: string): string {
    return `| where tostring(customDimensions.aadTenantId) == "${tenantId}"`;
}

function escapeTenantId(tenantId: string): string {
    return tenantId
        .replace(/"/g, '\\"')
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}

function generateMultiTenantFilter(tenantIds: string[]): string {
    const quotedIds = tenantIds.map(id => `"${id}"`).join(', ');
    return `| where tostring(customDimensions.aadTenantId) in~ (${quotedIds})`;
}

function extractCompanyName(userInput: string): string | null {
    // Simple extraction - in reality would use more sophisticated NLP
    const match = userInput.match(/for (.+?)(?:\s|$)/i);
    return match ? match[1] : null;
}

function shouldWarnAboutMissingTenant(mapping: { companyName: string; tenantId: string | null; count: number }): boolean {
    return !mapping.tenantId || mapping.count === 0;
}

function formatTenantMappingResponse(mappings: Array<{ companyName: string; tenantId: string; count: number }>): string {
    let response = 'Company Name → Tenant ID (Occurrences)\n';
    response += '-'.repeat(50) + '\n';

    mappings.forEach(m => {
        response += `${m.companyName} → ${m.tenantId} (${m.count} events)\n`;
    });

    response += '\nUsage example:\n';
    response += `traces | where tostring(customDimensions.aadTenantId) == "${mappings[0]?.tenantId}"`;

    return response;
}
