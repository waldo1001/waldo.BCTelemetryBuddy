/**
 * Tests for stdio mode logging behavior
 * 
 * This test suite verifies that the MCP server correctly separates:
 * - stdout: JSON-RPC messages only (parseable JSON)
 * - stderr: All log messages, debug output, diagnostics
 * 
 * This is critical for MCP clients like Claude Desktop that parse stdout as JSON-RPC.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('MCP Server stdio mode logging', () => {
    test('config loading uses console.error for all logs', () => {
        // This test verifies that config.ts uses console.error (not console.log)
        // which ensures logs go to stderr in stdio mode

        const configSource = fs.readFileSync(
            path.join(__dirname, '../config.ts'),
            'utf-8'
        );

        // Count console.log occurrences (should be 0 in production code)
        const logMatches = configSource.match(/console\.log\(/g);
        const logCount = logMatches ? logMatches.length : 0;

        // Count console.error occurrences (should be >0 for diagnostics)
        const errorMatches = configSource.match(/console\.error\(/g);
        const errorCount = errorMatches ? errorMatches.length : 0;

        // Verify config.ts uses console.error instead of console.log
        expect(logCount).toBe(0);
        expect(errorCount).toBeGreaterThan(0);
    });

    test('server.ts uses console.error for all diagnostic logs', () => {
        // This test verifies that server.ts uses console.error (not console.log)
        // which ensures logs go to stderr in stdio mode

        const serverSource = fs.readFileSync(
            path.join(__dirname, '../server.ts'),
            'utf-8'
        );

        // Extract only the server code (not the redirection setup at the end)
        // The redirection code legitimately references console.log
        const serverCodeOnly = serverSource.split('export async function startServer')[0];

        // Count console.log occurrences in server code (should be 0)
        const logMatches = serverCodeOnly.match(/console\.log\(/g);
        const logCount = logMatches ? logMatches.length : 0;

        // Count console.error occurrences (should be >0 for diagnostics)
        const errorMatches = serverCodeOnly.match(/console\.error\(/g);
        const errorCount = errorMatches ? errorMatches.length : 0;

        // Verify server.ts uses console.error instead of console.log
        expect(logCount).toBe(0);
        expect(errorCount).toBeGreaterThan(0);
    });

    test('startServer() includes console redirection for stdio mode', () => {
        // Verify that startServer() function has console redirection logic

        const serverSource = fs.readFileSync(
            path.join(__dirname, '../server.ts'),
            'utf-8'
        );

        // Check for stdio mode detection
        expect(serverSource).toContain('isStdioMode');
        expect(serverSource).toContain('!process.stdin.isTTY');

        // Check for console.log redirection
        expect(serverSource).toContain('console.log = (');
        expect(serverSource).toContain('process.stderr.write');

        // Check for console.error redirection
        expect(serverSource).toContain('console.error = (');
    });

    test('CLI commands can use console.log for user output', () => {
        // CLI commands (init, validate, test-auth, list-profiles) are interactive
        // and SHOULD use console.log for user-facing output (not diagnostic logs)

        const cliSource = fs.readFileSync(
            path.join(__dirname, '../cli.ts'),
            'utf-8'
        );

        // CLI commands should have console.log for user output
        const logMatches = cliSource.match(/console\.log\(/g);
        const logCount = logMatches ? logMatches.length : 0;

        // Verify CLI has console.log (it's a CLI tool, not a server)
        expect(logCount).toBeGreaterThan(0);
    });

    test('launcher.js handles module loading errors gracefully', () => {
        // Verify launcher.js has error handling

        const launcherSource = fs.readFileSync(
            path.join(__dirname, '../../launcher.js'),
            'utf-8'
        );

        // Check for try-catch
        expect(launcherSource).toContain('try {');
        expect(launcherSource).toContain('catch (error)');

        // Check for error logging
        expect(launcherSource).toContain('console.error');
    });
});

