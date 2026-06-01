/**
 * Pure config-building / merge logic for the connection-setup workflow.
 *
 * No file-system access here — callers pass the existing file content (or null)
 * and receive the new content to write. This keeps the logic unit-testable and
 * lets the CLI wrapper (src/scripts/write-config.ts) stay thin.
 */

export const CONFIG_SCHEMA_URL =
    'https://raw.githubusercontent.com/waldo1001/waldo.BCTelemetryBuddy/main/packages/mcp/config-schema.json';

const ZERO_GUID = '00000000-0000-0000-0000-000000000000';
const DEFAULT_KUSTO_URL = 'https://api.applicationinsights.io';

export type AuthFlow = 'device_code' | 'client_credentials' | 'azure_cli' | 'vscode_auth';

export interface ProfileInput {
    connectionName: string;
    authFlow: AuthFlow;
    applicationInsightsAppId: string;
    tenantId?: string;
    kustoClusterUrl?: string;
    clientId?: string;
    /** When set, the profile is written into a `profiles` map under this key. */
    profileName?: string;
}

export interface MergeResult {
    content: string;
    mode: 'created' | 'updated' | 'merged-profile';
    profileName?: string;
}

/** Turn a friendly connection name into a stable profile key. */
export function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Build the MCPConfig-shaped profile object from setup input, applying defaults. */
function buildProfile(input: ProfileInput): Record<string, unknown> {
    const profile: Record<string, unknown> = {
        connectionName: input.connectionName,
        authFlow: input.authFlow,
        tenantId: input.tenantId || ZERO_GUID,
        applicationInsightsAppId: input.applicationInsightsAppId,
        kustoClusterUrl: input.kustoClusterUrl || DEFAULT_KUSTO_URL,
        cacheEnabled: true,
        cacheTTLSeconds: 3600,
        removePII: false,
        workspacePath: '${workspaceFolder}',
        queriesFolder: 'queries',
        references: [],
    };
    if (input.clientId) {
        profile.clientId = input.clientId;
    }
    return profile;
}

/** Keys that identify a flat (single-profile) MCPConfig living at the top level. */
const FLAT_PROFILE_KEYS = [
    'connectionName', 'authFlow', 'tenantId', 'clientId', 'clientSecret',
    'applicationInsightsAppId', 'kustoClusterUrl', 'cacheEnabled', 'cacheTTLSeconds',
    'removePII', 'port', 'workspacePath', 'queriesFolder',
];

function extractFlatProfile(config: Record<string, any>): Record<string, unknown> {
    const profile: Record<string, unknown> = {};
    for (const key of FLAT_PROFILE_KEYS) {
        if (config[key] !== undefined) {
            profile[key] = config[key];
        }
    }
    if (config.references !== undefined) {
        profile.references = config.references;
    }
    return profile;
}

/**
 * Merge a setup profile into existing `.bctb-config.json` content.
 * @param existingRaw The current file content, or null when the file does not exist.
 * @param input The profile to write.
 */
export function mergeConfig(existingRaw: string | null, input: ProfileInput): MergeResult {
    const profile = buildProfile(input);

    // No existing config — create from scratch.
    if (!existingRaw || existingRaw.trim() === '') {
        if (input.profileName) {
            const obj = {
                $schema: CONFIG_SCHEMA_URL,
                defaultProfile: input.profileName,
                profiles: { [input.profileName]: profile },
            };
            return { content: stringify(obj), mode: 'created', profileName: input.profileName };
        }
        const obj = { $schema: CONFIG_SCHEMA_URL, ...profile };
        return { content: stringify(obj), mode: 'created' };
    }

    const existing = JSON.parse(existingRaw) as Record<string, any>;
    const profileKey = input.profileName || slugify(input.connectionName);
    const isProfiled = existing.profiles && typeof existing.profiles === 'object';
    const wantsProfile = !!input.profileName || isProfiled;

    if (wantsProfile) {
        const result: Record<string, any> = { ...existing };
        if (!result.$schema) {
            result.$schema = CONFIG_SCHEMA_URL;
        }

        if (!isProfiled) {
            // Existing is a flat single-profile config — migrate it into `profiles`
            // under its own derived key so it is not lost, then drop the flat keys.
            const oldName = existing.connectionName ? slugify(existing.connectionName) : 'default';
            const migrated = extractFlatProfile(existing);
            result.profiles = { [oldName]: migrated };
            result.defaultProfile = result.defaultProfile || oldName;
            for (const key of [...FLAT_PROFILE_KEYS, 'references']) {
                delete result[key];
            }
        } else {
            result.profiles = { ...existing.profiles };
        }

        result.profiles[profileKey] = profile;
        if (!result.defaultProfile) {
            result.defaultProfile = profileKey;
        }
        return { content: stringify(result), mode: 'merged-profile', profileName: profileKey };
    }

    // Existing flat config, no profile requested — reconfigure the single profile,
    // preserving any unrelated top-level keys (cache/sanitize/telemetry blocks, etc.).
    const updated = { ...existing, $schema: existing.$schema || CONFIG_SCHEMA_URL, ...profile };
    return { content: stringify(updated), mode: 'updated' };
}

function stringify(obj: unknown): string {
    return JSON.stringify(obj, null, 2) + '\n';
}
