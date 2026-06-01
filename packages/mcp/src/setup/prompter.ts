/**
 * A small line-oriented prompt helper built on classic `readline`.
 *
 * `readline/promises`'s `question()` is unreliable with piped (non-TTY) input —
 * a second question can reject with "readline was closed". This queues 'line'
 * events so it works identically whether input is a TTY or a pipe, and resolves
 * any pending question with '' when input closes.
 */

import * as readline from 'node:readline';
import { Readable, Writable } from 'node:stream';

export interface Prompter {
    question(prompt: string): Promise<string>;
    close(): void;
}

export function createPrompter(input: Readable, output: Writable): Prompter {
    const rl = readline.createInterface({ input, output });
    const lineQueue: string[] = [];
    const waiters: Array<(line: string) => void> = [];
    let closed = false;

    rl.on('line', (line: string) => {
        const waiter = waiters.shift();
        if (waiter) {
            waiter(line);
        } else {
            lineQueue.push(line);
        }
    });
    rl.on('close', () => {
        closed = true;
        while (waiters.length) {
            waiters.shift()!('');
        }
    });

    return {
        question(prompt: string): Promise<string> {
            output.write(prompt);
            if (lineQueue.length > 0) {
                return Promise.resolve(lineQueue.shift()!);
            }
            if (closed) {
                return Promise.resolve('');
            }
            return new Promise<string>((resolve) => waiters.push(resolve));
        },
        close(): void {
            rl.close();
        },
    };
}
