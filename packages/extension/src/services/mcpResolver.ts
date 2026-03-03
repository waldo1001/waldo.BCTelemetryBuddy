import * as fs from 'fs';
import * as path from 'path';
import { isMCPInPath } from './mcpInstaller';

export type McpMode = 'global' | 'bundled';

export interface McpResolution {
    mode: McpMode;
    /** For bundled: path to launcher.js. For global: undefined. */
    bundledPath?: string;
}

/**
 * Resolve which MCP server to use.
 *
 * Resolution order:
 *   1. If preferGlobal is set → always use global (legacy override)
 *   2. If global bctb-mcp is found in PATH → use it (keeps MCP independently updatable)
 *   3. If bundled launcher.js exists → fall back to bundled
 *   4. Otherwise → use global (will fail at spawn time if not installed)
 *
 * @param extensionPath  The extension's installation directory
 * @param preferGlobal   The bctb.mcp.preferGlobal setting value
 * @param isGlobalInPath Optional override for testability; when omitted calls isMCPInPath()
 */
export async function resolveMcpServer(
    extensionPath: string,
    preferGlobal: boolean,
    isGlobalInPath?: boolean
): Promise<McpResolution> {
    const mcpBundledPath = path.join(extensionPath, 'mcp', 'dist', 'launcher.js');
    const hasBundled = fs.existsSync(mcpBundledPath);

    // 1. Legacy override
    if (preferGlobal) {
        return { mode: 'global' };
    }

    // 2. Auto-detect global
    let globalAvailable = isGlobalInPath;
    if (globalAvailable === undefined) {
        try {
            globalAvailable = await isMCPInPath();
        } catch {
            globalAvailable = false;
        }
    }

    if (globalAvailable) {
        return { mode: 'global' };
    }

    // 3. Fall back to bundled
    if (hasBundled) {
        return { mode: 'bundled', bundledPath: mcpBundledPath };
    }

    // 4. Nothing found — try global anyway (spawn will error)
    return { mode: 'global' };
}
