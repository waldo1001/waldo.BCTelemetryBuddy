import { Command } from 'commander';
import { loadConfig, validateConfig, initConfig, loadConfigFromFile } from './config.js';
import { AuthService } from '@bctb/shared';
import * as fs from 'fs';
import * as path from 'path';
import { VERSION } from './version.js';

const program = new Command();

program
    .name('bctb-mcp')
    .description('BC Telemetry Buddy MCP Server')
    .version(VERSION);

program
    .command('start')
    .description('Start the MCP server')
    .option('-c, --config <path>', 'Path to config file')
    .option('--stdio', 'Use stdio mode (default)', true)
    .option('--http', 'Use HTTP mode')
    .option('-p, --profile <name>', 'Profile name to use (for multi-profile configs)')
    .action(async (options) => {
        try {
            const config = loadConfigFromFile(options.config, options.profile);
            if (!config) {
                console.error('No config file found.');
                console.error('Run: bctb-mcp init');
                process.exit(1);
            }

            const errors = validateConfig(config);

            if (errors.length > 0) {
                console.error('Configuration errors:');
                errors.forEach(err => console.error(`  - ${err}`));
                process.exit(1);
            }

            // Import and start server
            const { startServer } = await import('./server.js');

            if (options.http) {
                await startServer(config, 'http');
            } else {
                await startServer(config, 'stdio');
            }
        } catch (error: any) {
            console.error('Failed to start server:', error.message);
            process.exit(1);
        }
    });

program
    .command('init')
    .description('Create a config file template')
    .option('-o, --output <path>', 'Output path', '.bctb-config.json')
    .action((options) => {
        try {
            if (fs.existsSync(options.output)) {
                console.error(`File already exists: ${options.output}`);
                console.error('Use a different path or delete the existing file.');
                process.exit(1);
            }

            initConfig(options.output);
            console.log(`✓ Created config template: ${options.output}`);
            console.log('\nNext steps:');
            console.log('1. Edit the config file with your Application Insights details');
            console.log('2. Run: bctb-mcp validate');
            console.log('3. Run: bctb-mcp start');
        } catch (error: any) {
            console.error('Failed to create config:', error.message);
            process.exit(1);
        }
    });

program
    .command('validate')
    .description('Validate a config file')
    .option('-c, --config <path>', 'Path to config file', '.bctb-config.json')
    .option('-p, --profile <name>', 'Profile name to validate (for multi-profile configs)')
    .action((options) => {
        try {
            const config = loadConfigFromFile(options.config, options.profile);
            if (!config) {
                console.error('✗ No config file found.');
                console.error('Run: bctb-mcp init');
                process.exit(1);
            }
            const errors = validateConfig(config);

            if (errors.length === 0) {
                console.log('✓ Configuration is valid');
                console.log(`  Connection: ${config.connectionName}`);
                console.log(`  Auth flow: ${config.authFlow}`);
                console.log(`  App Insights: ${config.applicationInsightsAppId || 'Not configured'}`);
            } else {
                console.error('✗ Configuration errors:');
                errors.forEach(err => console.error(`  - ${err}`));
                process.exit(1);
            }
        } catch (error: any) {
            console.error('✗ Failed to load config:', error.message);
            process.exit(1);
        }
    });

program
    .command('test-auth')
    .description('Test authentication')
    .option('-c, --config <path>', 'Path to config file', '.bctb-config.json')
    .option('-p, --profile <name>', 'Profile name to test (for multi-profile configs)')
    .action(async (options) => {
        try {
            const config = loadConfigFromFile(options.config, options.profile);
            if (!config) {
                console.error('✗ No config file found.');
                console.error('Run: bctb-mcp init');
                process.exit(1);
            }
            const auth = new AuthService(config);

            console.log(`Testing authentication for: ${config.connectionName}`);
            console.log(`Auth flow: ${config.authFlow}\n`);

            const result = await auth.authenticate();

            if (result.authenticated) {
                console.log('✓ Authentication successful');
                console.log(`  User: ${result.user}`);
                if (result.expiresOn) {
                    console.log(`  Expires: ${result.expiresOn.toISOString()}`);
                }
            } else {
                console.error('✗ Authentication failed');
                process.exit(1);
            }
        } catch (error: any) {
            console.error('✗ Authentication failed:', error.message);
            process.exit(1);
        }
    });

program
    .command('list-profiles')
    .description('List all available profiles')
    .option('-c, --config <path>', 'Path to config file', '.bctb-config.json')
    .action((options) => {
        try {
            const configPath = options.config || '.bctb-config.json';

            if (!fs.existsSync(configPath)) {
                console.error(`Config file not found: ${configPath}`);
                process.exit(1);
            }

            const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

            if (!rawConfig.profiles) {
                console.log('No profiles found (single config mode)');
                console.log(`Connection: ${rawConfig.connectionName || 'Unnamed'}`);
                return;
            }

            console.log('Available profiles:\n');
            Object.entries(rawConfig.profiles).forEach(([name, profile]: [string, any]) => {
                const isDefault = name === rawConfig.defaultProfile;
                const marker = isDefault ? '✓' : ' ';
                const baseMarker = name.startsWith('_') ? '(base profile)' : '';
                console.log(`  [${marker}] ${name}`);
                console.log(`      ${profile.connectionName || 'Unnamed'} ${baseMarker}`);
                if (profile.extends) {
                    console.log(`      Extends: ${profile.extends}`);
                }
                console.log('');
            });

            if (rawConfig.defaultProfile) {
                console.log(`Default profile: ${rawConfig.defaultProfile}`);
            }
        } catch (error: any) {
            console.error('Failed to list profiles:', error.message);
            process.exit(1);
        }
    });

program.parse();
