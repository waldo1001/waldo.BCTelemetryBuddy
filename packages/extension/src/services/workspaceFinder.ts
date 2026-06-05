import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const CONFIG_FILENAME = '.bctb-config.json';

/**
 * Priority folder names for multi-root workspaces (case-insensitive).
 * When multiple workspace folders are open, these folders are checked first.
 * Priority order: telemetry > monitoring > analytics > insights
 */
const PRIORITY_FOLDER_NAMES = ['telemetry', 'monitoring', 'analytics', 'insights'] as const;

/**
 * Find a priority folder in multi-root workspaces.
 * Returns the first priority folder (by priority order) that contains a config file.
 * Returns undefined if no priority folder with config exists.
 */
function findPriorityFolder(
    workspaceFolders: readonly vscode.WorkspaceFolder[],
    outputChannel?: vscode.OutputChannel
): { workspacePath: string; configFilePath: string } | undefined {
    // Loop through priority names in order (telemetry > monitoring > analytics > insights)
    for (const priorityName of PRIORITY_FOLDER_NAMES) {
        // Find workspace folder with matching name (case-insensitive)
        const folder = workspaceFolders.find(f =>
            f.name.toLowerCase() === priorityName.toLowerCase()
        );

        if (folder) {
            // Check if this priority folder has a config file
            const candidate = path.join(folder.uri.fsPath, CONFIG_FILENAME);
            if (fs.existsSync(candidate)) {
                outputChannel?.appendLine(`[Config Discovery] ✓ Priority folder '${folder.name}' has config`);
                return { workspacePath: folder.uri.fsPath, configFilePath: candidate };
            } else {
                outputChannel?.appendLine(`[Config Discovery] ✗ Priority folder '${folder.name}' found but no config`);
            }
        }
    }

    return undefined;
}

/**
 * Find the first workspace folder that contains a .bctb-config.json file.
 * Falls back to the first workspace folder if none contain a config file.
 *
 * This supports multiroot workspaces where the config file may not live
 * in the first folder.
 *
 * @returns The workspace folder path and (optional) config file path,
 *          or undefined if no workspace folders are open.
 */
export function findConfigWorkspace(outputChannel?: vscode.OutputChannel): { workspacePath: string; configFilePath: string | undefined } | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        outputChannel?.appendLine('[Config Discovery] No workspace folders open');
        return undefined;
    }

    outputChannel?.appendLine(`[Config Discovery] Scanning ${workspaceFolders.length} workspace folder(s) for ${CONFIG_FILENAME}...`);

    // PRIORITY 1: In multi-root workspaces, check priority folders first
    if (workspaceFolders.length > 1) {
        const priorityFolder = findPriorityFolder(workspaceFolders, outputChannel);
        if (priorityFolder) {
            outputChannel?.appendLine(`[Config Discovery] → Using priority folder: ${priorityFolder.workspacePath}`);
            return priorityFolder;
        }
    }

    // PRIORITY 2: Loop through all workspace folders; return the first one that has a config file
    for (const folder of workspaceFolders) {
        const candidate = path.join(folder.uri.fsPath, CONFIG_FILENAME);
        const exists = fs.existsSync(candidate);
        outputChannel?.appendLine(`[Config Discovery]   ${exists ? '✓' : '✗'} ${folder.uri.fsPath}`);
        if (exists) {
            outputChannel?.appendLine(`[Config Discovery] → Using config from: ${candidate}`);
            return { workspacePath: folder.uri.fsPath, configFilePath: candidate };
        }
    }

    // PRIORITY 3: No config file found in any folder — fall back to the first workspace folder
    outputChannel?.appendLine(`[Config Discovery] No config file found — falling back to first folder: ${workspaceFolders[0].uri.fsPath}`);
    return { workspacePath: workspaceFolders[0].uri.fsPath, configFilePath: undefined };
}

/**
 * Return the workspace folder path that should be treated as "active" for
 * BCTB operations: the folder containing .bctb-config.json, or the first
 * folder if none have a config, or undefined if no workspace is open.
 *
 * Thin wrapper around findConfigWorkspace() for callers that only need the path.
 */
export function getActiveWorkspacePath(outputChannel?: vscode.OutputChannel): string | undefined {
    return findConfigWorkspace(outputChannel)?.workspacePath;
}
