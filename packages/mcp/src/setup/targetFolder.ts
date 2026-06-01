/**
 * Validate the target workspace folder before writing .bctb-config.json.
 *
 * Fails fast with a clear, actionable message when the folder is missing or is
 * not a directory — a non-existent path is almost always a typo, and silently
 * creating it would write the config into the wrong place. fs is injected for testing.
 */

interface FsLike {
    existsSync: (p: string) => boolean;
    statSync: (p: string) => { isDirectory: () => boolean };
}

export function validateTargetFolder(folder: string, fs: FsLike): void {
    if (!fs.existsSync(folder)) {
        throw new Error(
            `Target folder does not exist: ${folder}\n` +
            `Pass --folder pointing at an existing workspace folder (create it first if needed).`
        );
    }
    if (!fs.statSync(folder).isDirectory()) {
        throw new Error(`Target path is not a directory: ${folder}`);
    }
}
