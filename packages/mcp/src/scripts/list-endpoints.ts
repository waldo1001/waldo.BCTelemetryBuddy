/**
 * CLI: discover Application Insights endpoints via Azure CLI.
 *
 * Thin wrapper around setup/endpointDiscovery — prints a JSON array of
 * { name, appId, resourceGroup, subscriptionId, tenantId, location } to stdout.
 * Exits non-zero with a manual-fallback hint when Azure CLI is unavailable.
 *
 * Run via: npx -p bc-telemetry-buddy-mcp bctb-setup-endpoints
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { discoverEndpoints, AzUnavailableError, RunAz } from '../setup/endpointDiscovery.js';

const execAsync = promisify(exec);

const runAz: RunAz = async (args: string) => {
    const { stdout } = await execAsync(`az ${args}`, {
        env: { ...process.env, PYTHONWARNINGS: 'ignore' },
        maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
};

async function main(): Promise<void> {
    try {
        const endpoints = await discoverEndpoints(runAz);
        process.stdout.write(JSON.stringify(endpoints, null, 2) + '\n');
        if (endpoints.length === 0) {
            process.stderr.write(
                'No Application Insights resources found. Set up the connection manually by pasting your App ID from the Azure Portal.\n'
            );
        }
    } catch (err) {
        const message = err instanceof AzUnavailableError ? err.message : (err as Error).message;
        process.stderr.write(`${message}\n`);
        process.exit(1);
    }
}

main();
