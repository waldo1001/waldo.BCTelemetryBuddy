/**
 * Application Insights endpoint discovery via Azure CLI.
 *
 * The `az` invocations are injected (RunAz) so this is fully unit-testable and the
 * CLI wrapper (src/scripts/list-endpoints.ts) stays thin. Works in any shell, which
 * is why it is the discovery mechanism regardless of which authFlow ends up in the
 * config. When `az` is missing/unauthenticated, callers fall back to manual App-ID entry.
 */

/** Runs an `az` command (args string, no leading "az") and returns stdout. */
export type RunAz = (args: string) => Promise<string>;

export interface Endpoint {
    name: string;
    appId: string;
    resourceGroup: string;
    subscriptionId: string;
    tenantId: string;
    location: string;
}

interface Subscription {
    id: string;
    tenantId: string;
}

/** Thrown when Azure CLI is not installed or the user is not logged in. */
export class AzUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AzUnavailableError';
    }
}

const AZ_UNAVAILABLE_HINT =
    'Azure CLI is unavailable or you are not signed in. Install Azure CLI and run `az login`, ' +
    'or set up the connection manually by pasting your Application Insights App ID from the Azure Portal.';

function looksLikeAzMissing(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /command not found|not recognized|az login|please run 'az login'|no subscription/i.test(msg);
}

export function parseSubscriptions(json: string): Subscription[] {
    const arr = JSON.parse(json) as Array<{ id: string; tenantId: string }>;
    return arr.map(s => ({ id: s.id, tenantId: s.tenantId }));
}

/**
 * Enumerate Application Insights components across all visible subscriptions.
 * @throws AzUnavailableError when the initial `az account list` fails (az missing / not logged in).
 */
export async function discoverEndpoints(runAz: RunAz): Promise<Endpoint[]> {
    let subs: Subscription[];
    try {
        subs = parseSubscriptions(await runAz('account list -o json'));
    } catch (err) {
        if (looksLikeAzMissing(err)) {
            throw new AzUnavailableError(AZ_UNAVAILABLE_HINT);
        }
        throw new AzUnavailableError(AZ_UNAVAILABLE_HINT);
    }

    const endpoints: Endpoint[] = [];

    for (const sub of subs) {
        let components: Array<{ id: string; name: string; resourceGroup: string; location: string }>;
        try {
            const listed = await runAz(
                `resource list --resource-type microsoft.insights/components --subscription ${sub.id} -o json`
            );
            components = JSON.parse(listed);
        } catch {
            // Partial failure (e.g. AuthorizationFailed on one subscription) — skip and continue.
            continue;
        }

        for (const comp of components) {
            try {
                const shown = await runAz(`monitor app-insights component show --ids ${comp.id} -o json`);
                const appId = (JSON.parse(shown) as { appId?: string }).appId;
                if (!appId) {
                    continue;
                }
                endpoints.push({
                    name: comp.name,
                    appId,
                    resourceGroup: comp.resourceGroup,
                    subscriptionId: sub.id,
                    tenantId: sub.tenantId,
                    location: comp.location,
                });
            } catch {
                // Skip components we cannot resolve.
                continue;
            }
        }
    }

    return endpoints;
}
