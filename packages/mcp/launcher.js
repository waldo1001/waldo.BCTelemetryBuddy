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

try {
    require('./server.js');
} catch (error) {
    console.error('[MCP Launcher] Failed to start MCP server:', error.message);
    process.exit(1);
}
