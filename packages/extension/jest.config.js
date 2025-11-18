/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/test/**',
        '!src/__tests__/**',
        '!src/extension.ts',  // Requires VSCode environment, use test:integration for E2E tests
        '!src/webviews/SetupWizardProvider.ts',  // Large UI component (838 lines) with complex webview interactions requiring integration testing
        '!src/webviews/ProfileWizardProvider.ts',  // UI component (236 lines) with complex webview interactions requiring integration testing
        '!src/chatmodeDefinitions.ts',  // Pure data (1031 lines of static chatmode content), no logic to test
        '!src/services/profileManager.ts',  // Profile management service (301 lines) - requires VSCode workspace API integration testing
        '!src/ui/profileStatusBar.ts'  // Status bar UI component (196 lines) - requires VSCode UI API integration testing
    ],
    coverageThreshold: {
        global: {
            branches: 60,  // Lower than statements/lines due to UI-heavy code with many conditional branches
            functions: 70,
            lines: 70,
            statements: 70
        }
    },
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1'
    },
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                useESM: true,
                tsconfig: {
                    module: 'ES2022',
                    moduleResolution: 'node'
                }
            }
        ]
    }
};
