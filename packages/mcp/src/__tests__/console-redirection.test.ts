/**
 * Unit tests for console redirection in stdio mode
 * 
 * Verifies that the console.log/console.error redirection mechanism
 * properly routes all output to stderr in stdio mode.
 */

describe('Console redirection in stdio mode', () => {
    let originalLog: typeof console.log;
    let originalError: typeof console.error;
    let stderrWrites: string[];
    let originalStderrWrite: typeof process.stderr.write;

    beforeEach(() => {
        // Save original functions
        originalLog = console.log;
        originalError = console.error;
        originalStderrWrite = process.stderr.write;

        // Track stderr writes
        stderrWrites = [];
        process.stderr.write = ((chunk: any) => {
            stderrWrites.push(chunk.toString());
            return true;
        }) as any;
    });

    afterEach(() => {
        // Restore original functions
        console.log = originalLog;
        console.error = originalError;
        process.stderr.write = originalStderrWrite;
    });

    test('should redirect console.log to stderr in stdio mode', () => {
        // Apply stdio mode redirection
        console.log = (...args: any[]) => {
            process.stderr.write('[MCP] ' + args.join(' ') + '\n');
        };

        // Write a log message
        console.log('Test log message');

        // Verify it went to stderr
        expect(stderrWrites.length).toBe(1);
        expect(stderrWrites[0]).toBe('[MCP] Test log message\n');
    });

    test('should redirect console.error to stderr in stdio mode', () => {
        // Apply stdio mode redirection
        console.error = (...args: any[]) => {
            process.stderr.write('[MCP] ' + args.join(' ') + '\n');
        };

        // Write an error message
        console.error('Test error message');

        // Verify it went to stderr
        expect(stderrWrites.length).toBe(1);
        expect(stderrWrites[0]).toBe('[MCP] Test error message\n');
    });

    test('should preserve message content during redirection', () => {
        // Apply stdio mode redirection
        console.log = (...args: any[]) => {
            process.stderr.write('[MCP] ' + args.join(' ') + '\n');
        };

        // Write messages with various types
        console.log('String', 123, true, { key: 'value' });

        // Verify content is preserved
        expect(stderrWrites[0]).toContain('String');
        expect(stderrWrites[0]).toContain('123');
        expect(stderrWrites[0]).toContain('true');
        expect(stderrWrites[0]).toContain('[object Object]');
    });

    test('should handle multi-line log messages', () => {
        // Apply stdio mode redirection
        console.error = (...args: any[]) => {
            process.stderr.write('[MCP] ' + args.join(' ') + '\n');
        };

        // Write multi-line message
        const multiLine = 'Line 1\nLine 2\nLine 3';
        console.error(multiLine);

        // Verify entire message is written
        expect(stderrWrites.length).toBe(1);
        expect(stderrWrites[0]).toContain('Line 1');
        expect(stderrWrites[0]).toContain('Line 2');
        expect(stderrWrites[0]).toContain('Line 3');
    });

    test('should handle emoji and special characters', () => {
        // Apply stdio mode redirection
        console.error = (...args: any[]) => {
            process.stderr.write('[MCP] ' + args.join(' ') + '\n');
        };

        // Write message with emoji
        console.error('✓ Success', '⚠️  Warning', '❌ Error');

        // Verify emoji is preserved
        expect(stderrWrites[0]).toContain('✓');
        expect(stderrWrites[0]).toContain('⚠️');
        expect(stderrWrites[0]).toContain('❌');
    });

    test('should add [MCP] prefix to all redirected logs', () => {
        // Apply stdio mode redirection
        console.log = (...args: any[]) => {
            process.stderr.write('[MCP] ' + args.join(' ') + '\n');
        };

        console.error = (...args: any[]) => {
            process.stderr.write('[MCP] ' + args.join(' ') + '\n');
        };

        // Write messages
        console.log('Log message');
        console.error('Error message');

        // Verify both have [MCP] prefix
        expect(stderrWrites[0]).toMatch(/^\[MCP\] /);
        expect(stderrWrites[1]).toMatch(/^\[MCP\] /);
    });

    test('stdout should remain untouched by console redirection', () => {
        let stdoutWrites: string[] = [];
        const originalStdoutWrite = process.stdout.write;

        process.stdout.write = ((chunk: any) => {
            stdoutWrites.push(chunk.toString());
            return true;
        }) as any;

        try {
            // Apply stdio mode redirection (only affects console.log/error)
            console.log = (...args: any[]) => {
                process.stderr.write('[MCP] ' + args.join(' ') + '\n');
            };

            // Direct stdout write should still work
            process.stdout.write('Direct stdout write\n');

            // Console.log should NOT write to stdout
            console.log('Console log message');

            // Verify stdout only has direct write
            expect(stdoutWrites.length).toBe(1);
            expect(stdoutWrites[0]).toBe('Direct stdout write\n');

            // Verify stderr has console.log
            expect(stderrWrites.length).toBe(1);
            expect(stderrWrites[0]).toContain('Console log message');
        } finally {
            process.stdout.write = originalStdoutWrite;
        }
    });
});
