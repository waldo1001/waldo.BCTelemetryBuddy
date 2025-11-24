/**
 * Mock for vscode module used in Jest tests
 */

export const workspace = {
    getConfiguration: jest.fn(() => ({
        get: jest.fn((key: string, defaultValue?: any) => defaultValue)
    })),
    workspaceFolders: undefined
};

export const ExtensionContext = jest.fn();

export default {
    workspace,
    ExtensionContext
};
