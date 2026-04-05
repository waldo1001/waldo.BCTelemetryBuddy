#!/usr/bin/env node
/**
 * MCP Server Launcher
 * 
 * This launcher forces Node.js to treat the bundled server as CommonJS,
 * avoiding "Dynamic require is not supported" errors that occur when
 * Node's ESM loader encounters dynamic require() calls.
 * 
 * By using a .js extension with CommonJS code and "type": "commonjs" in
 * package.json, we ensure reliable module loading across all environments.
 */

// Suppress DEP0169 (url.parse() standardization warning) emitted by dependencies.
// Patching process.emit intercepts the warning before Node's internal stderr printer.
const _originalEmit = process.emit.bind(process);
process.emit = function (event, ...args) {
    if (event === 'warning' && args[0] && args[0].code === 'DEP0169') return false;
    return _originalEmit(event, ...args);
};

try {
    const server = require('./server.js');

    if (typeof server.startServer === 'function') {
        server.startServer();
    } else {
        console.error('[MCP Launcher] ERROR: startServer function not exported');
        process.exit(1);
    }
} catch (error) {
    console.error('[MCP Launcher] Failed to start MCP server:', error.message);
    console.error(error.stack);
    process.exit(1);
}