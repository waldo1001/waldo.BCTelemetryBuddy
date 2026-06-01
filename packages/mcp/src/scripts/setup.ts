/**
 * Interactive guided setup CLI: walks the user (via Azure CLI) from start to finish
 * to produce a .bctb-config.json. Reuses the tested setup/ logic; this file is the
 * thin readline + child_process orchestration layer (an entry point, excluded from coverage).
 *
 * Run via: npx -p bc-telemetry-buddy-mcp bctb-setup [--folder <path>]
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec, spawnSync } from 'child_process';
import { promisify } from 'util';
import { stdin as input, stdout as output } from 'node:process';
import { discoverEndpoints, RunAz, Endpoint } from '../setup/endpointDiscovery.js';
import { mergeConfig, ProfileInput } from '../setup/configMerge.js';
import { validateTargetFolder } from '../setup/targetFolder.js';
import { parseSelection } from '../setup/parseSelection.js';
import { createPrompter } from '../setup/prompter.js';

const execAsync = promisify(exec);

const runAz: RunAz = async (args: string) => {
    const { stdout } = await execAsync(`az ${args}`, {
        env: { ...process.env, PYTHONWARNINGS: 'ignore' },
        maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
};

function getArg(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
    const rl = createPrompter(input, output);
    const ask = async (q: string, def?: string): Promise<string> => {
        const answer = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
        return answer || def || '';
    };

    try {
        console.log('\nBC Telemetry Buddy — guided setup\n');

        // 1. Target folder
        let folder = getArg('--folder') || await ask('Folder to write .bctb-config.json into', process.cwd());
        folder = path.resolve(folder);
        validateTargetFolder(folder, fs);

        // 2. Azure CLI login
        let account: { user?: { name?: string }; tenantId?: string } | null = null;
        try {
            account = JSON.parse(await runAz('account show -o json'));
        } catch {
            const yn = await ask('Not signed in to Azure CLI. Run `az login` now? (y/n)', 'y');
            if (/^y/i.test(yn)) {
                spawnSync('az', ['login'], { stdio: 'inherit' });
                try { account = JSON.parse(await runAz('account show -o json')); } catch { /* still not logged in */ }
            }
        }
        if (account?.user?.name) {
            console.log(`✓ Azure CLI: signed in as ${account.user.name}`);
        }
        console.log(`  Config target: ${folder}\n`);

        // 3. Discover endpoints (manual fallback on failure / empty)
        let endpoints: Endpoint[] = [];
        try {
            console.log('Finding your Application Insights resources…\n');
            endpoints = await discoverEndpoints(runAz);
        } catch {
            endpoints = [];
        }

        let appId = '';
        let tenantId = account?.tenantId || '';
        let suggestedName = 'My BC Environment';

        if (endpoints.length > 0) {
            endpoints.forEach((e, i) => console.log(`  ${i + 1}. ${e.name}  (${e.resourceGroup}, ${e.location})`));
            console.log('');
            let idx: number | null = null;
            while (idx === null) {
                idx = parseSelection(await ask('Pick a number'), endpoints.length);
                if (idx === null) console.log('  Invalid choice — enter the number next to the resource.');
            }
            appId = endpoints[idx].appId;
            tenantId = endpoints[idx].tenantId;
            suggestedName = endpoints[idx].name;
        } else {
            console.log('No resources found via Azure CLI (or it is unavailable). Enter values manually.');
            console.log('Azure Portal → your Application Insights → Configure → API Access.\n');
            while (!appId) appId = await ask('Application Insights App ID');
            tenantId = await ask('Tenant ID', tenantId || '00000000-0000-0000-0000-000000000000');
        }

        // 4. Names
        const connectionName = await ask('Connection name', suggestedName);
        const profileName = await ask('Profile name (leave blank for single-profile)', '');

        // 5. Write
        const profileInput: ProfileInput = {
            connectionName,
            authFlow: 'azure_cli',
            applicationInsightsAppId: appId,
            tenantId,
            profileName: profileName || undefined,
        };
        const filePath = path.join(folder, '.bctb-config.json');
        const existingRaw = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
        const { content, mode } = mergeConfig(existingRaw, profileInput);

        const confirm = await ask(`\nWrite ${filePath} (${mode})? (y/n)`, 'y');
        if (!/^y/i.test(confirm)) {
            console.log('Aborted — nothing written.');
            rl.close();
            return;
        }
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`\n✓ Wrote ${filePath}`);
        console.log('  Reload VS Code (Developer: Reload Window) or restart the MCP server to start querying.\n');
        rl.close();
    } catch (err) {
        console.error(`\n✗ ${(err as Error).message}`);
        rl.close();
        process.exit(1);
    }
}

main();
