/**
 * CLI: write / merge a BC Telemetry Buddy connection profile into .bctb-config.json.
 *
 * Thin wrapper around setup/configMerge — reads any existing config in the target
 * folder, merges the new profile (single-profile or named profile, multi-root safe),
 * writes the result, and prints { filePath, mode } as JSON.
 *
 * Run via:
 *   npx -p bc-telemetry-buddy-mcp bctb-setup-write-config \
 *     --folder <abs> --connectionName <s> --authFlow <flow> --appId <guid> \
 *     [--tenantId <guid>] [--clientId <guid>] [--profile <name>]
 */

import * as fs from 'fs';
import * as path from 'path';
import { mergeConfig, ProfileInput, AuthFlow } from '../setup/configMerge.js';

const VALID_FLOWS: AuthFlow[] = ['azure_cli', 'vscode_auth', 'device_code', 'client_credentials'];

function parseArgs(argv: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
            out[key] = value;
        }
    }
    return out;
}

function fail(message: string): never {
    process.stderr.write(`${message}\n`);
    process.exit(1);
}

function main(): void {
    const args = parseArgs(process.argv.slice(2));

    const folder = args.folder;
    const connectionName = args.connectionName;
    const authFlow = args.authFlow as AuthFlow;
    const appId = args.appId;

    if (!folder) fail('--folder is required (absolute path to the workspace folder to configure)');
    if (!connectionName) fail('--connectionName is required');
    if (!authFlow || !VALID_FLOWS.includes(authFlow)) {
        fail(`--authFlow is required and must be one of: ${VALID_FLOWS.join(', ')}`);
    }
    if (!appId) fail('--appId is required (Application Insights Application ID)');

    const input: ProfileInput = {
        connectionName,
        authFlow,
        applicationInsightsAppId: appId,
        tenantId: args.tenantId,
        clientId: args.clientId,
        profileName: args.profile,
    };

    const filePath = path.join(folder, '.bctb-config.json');
    const existingRaw = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;

    const { content, mode, profileName } = mergeConfig(existingRaw, input);
    fs.writeFileSync(filePath, content, 'utf8');

    process.stdout.write(JSON.stringify({ filePath, mode, profileName }, null, 2) + '\n');
}

main();
