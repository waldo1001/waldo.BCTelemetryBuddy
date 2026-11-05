import { exec } from 'child_process';
import { promisify } from 'util';
import { registerTelemetryRedaction } from './usageTelemetryUtils.js';

const execAsync = promisify(exec);

const RESOURCE = 'https://api.applicationinsights.io';

/** Written by the setup wizard and configMerge as "no tenant". `az` rejects it (AADSTS900021). */
const ZERO_GUID = '00000000-0000-0000-0000-000000000000';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DNS_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const DOMAIN = new RegExp(`^(?=.{1,253}$)${DNS_LABEL}(?:\\.${DNS_LABEL})+$`, 'i');

export interface AzureCliToken {
    accessToken: string;
    expiresOn?: Date;
    subscription?: string;
    /** Tenant as reported by `az`. */
    tenant?: string;
    /** Tenant passed with `--tenant`; undefined when none is configured. */
    requestedTenant?: string;
}

/**
 * Turns a configured tenantId into a value that is safe in a shell command.
 *
 * The command needs a shell: on Windows `az` is `az.cmd`, which Node refuses to spawn without one
 * (CVE-2024-27980). This allowlist is therefore the injection control. It admits no shell
 * metacharacters, no whitespace and no leading hyphen.
 *
 * @returns the tenant, or undefined when none is configured
 * @throws when the value is neither a GUID nor a domain; the value is deliberately not echoed
 */
export function resolveAzureCliTenant(tenantId?: unknown): string | undefined {
    if (tenantId === undefined || tenantId === null) {
        return undefined;
    }
    const tenant = typeof tenantId === 'string' ? tenantId.trim() : undefined;
    if (tenant === '' || tenant === ZERO_GUID) {
        return undefined;
    }
    if (tenant === undefined || !(GUID.test(tenant) || DOMAIN.test(tenant))) {
        throw new Error(
            'The tenantId in .bctb-config.json is not valid for Azure CLI authentication. ' +
            'Use the tenant GUID or a domain such as contoso.onmicrosoft.com, ' +
            'or remove tenantId to use your default az tenant.'
        );
    }
    return tenant;
}

/** Only for a tenant that came out of resolveAzureCliTenant; not exported, so no caller can skip that. */
function buildAzureCliTokenCommand(tenant?: string): string {
    const tenantArgument = tenant ? `--tenant ${tenant} ` : '';
    return `az account get-access-token ${tenantArgument}--resource ${RESOURCE}`;
}

function isAzNotInstalled(message: string): boolean {
    return message.includes('command not found') || message.includes('not recognized');
}

/**
 * Gets an Application Insights token from Azure CLI, for the configured tenant when there is one.
 * The only place in this repository that runs `az account get-access-token`.
 */
export async function acquireAzureCliToken(tenantId?: unknown): Promise<AzureCliToken> {
    const requestedTenant = resolveAzureCliTenant(tenantId);
    if (requestedTenant) {
        // Before exec: Node's "Command failed: az ... --tenant <value>" carries the tenant.
        registerTelemetryRedaction(requestedTenant);
    }

    let stdout: string;
    try {
        // PYTHONWARNINGS=ignore suppresses urllib3/LibreSSL noise on macOS Python 3.9
        const result = await execAsync(buildAzureCliTokenCommand(requestedTenant), {
            env: { ...process.env, PYTHONWARNINGS: 'ignore' }
        });
        stdout = result.stdout;
        if (result.stderr) {
            console.error('Azure CLI stderr:', result.stderr);
        }
    } catch (error: any) {
        if (!requestedTenant || isAzNotInstalled(error.message)) {
            throw error;
        }
        throw new Error(
            `Azure CLI could not get a token for tenant ${requestedTenant}. ` +
            `Run: az login --tenant ${requestedTenant}, ` +
            `or remove tenantId from .bctb-config.json to use your default az tenant. ` +
            `Azure CLI said: ${error.message}`
        );
    }

    const token = JSON.parse(stdout);
    if (!token.accessToken) {
        throw new Error('No access token returned from Azure CLI');
    }

    return {
        accessToken: token.accessToken,
        expiresOn: token.expiresOn ? new Date(token.expiresOn) : undefined,
        subscription: token.subscription,
        tenant: token.tenant,
        requestedTenant
    };
}

/**
 * Reads the `tid` claim of an access token, for display only. The signature is not checked, and
 * nothing may be decided from this value.
 */
export function tenantFromToken(accessToken: string): string | undefined {
    try {
        const payload = accessToken.split('.')[1];
        const tid = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')).tid;
        return typeof tid === 'string' && GUID.test(tid) ? tid : undefined;
    } catch {
        return undefined;
    }
}

/**
 * The sentence that tells a user which tenant a rejected token belongs to, or an empty string when
 * that is unknown, which leaves the surrounding message exactly as it was.
 */
export function tokenTenantHint(tenant?: string): string {
    if (!tenant) {
        return '';
    }
    registerTelemetryRedaction(tenant);
    return `The token was issued for tenant ${tenant}, and the resource must be in that tenant. ` +
        `If it is not, set tenantId in .bctb-config.json to the resource's tenant. `;
}
