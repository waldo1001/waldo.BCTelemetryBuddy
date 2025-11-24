module.exports = {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                useESM: true,
            },
        ],
    },
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/*.test.ts',
        '!src/**/*.spec.ts',
        '!src/__tests__/**',
        '!src/server.ts',  // Exclude MCP server entry point (requires full integration testing)
        '!src/cli.ts',  // Exclude CLI entry point (requires full integration testing)
        '!src/version.ts',  // Exclude auto-generated version file
        '!src/mcpTelemetry.ts'  // Exclude telemetry (requires Application Insights integration testing)
    ],
    coverageThreshold: {
        global: {
            branches: 60,
            functions: 65,
            lines: 70,
            statements: 70
        }
    }
};
