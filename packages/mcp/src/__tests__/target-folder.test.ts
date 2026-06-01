import { validateTargetFolder } from '../setup/targetFolder.js';

function fakeFs(map: Record<string, 'dir' | 'file'>) {
    return {
        existsSync: (p: string) => p in map,
        statSync: (p: string) => ({ isDirectory: () => map[p] === 'dir' }),
    };
}

describe('validateTargetFolder', () => {
    it('returns normally when the folder exists and is a directory', () => {
        expect(() => validateTargetFolder('/work/proj', fakeFs({ '/work/proj': 'dir' }) as any)).not.toThrow();
    });

    it('throws a clear error when the folder does not exist', () => {
        expect(() => validateTargetFolder('/tmp/x', fakeFs({}) as any))
            .toThrow(/does not exist/i);
    });

    it('throws when the path exists but is a file, not a directory', () => {
        expect(() => validateTargetFolder('/tmp/f', fakeFs({ '/tmp/f': 'file' }) as any))
            .toThrow(/not a directory/i);
    });
});
