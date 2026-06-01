import { PassThrough } from 'node:stream';
import { createPrompter } from '../setup/prompter.js';

function setup() {
    const input = new PassThrough();
    const output = new PassThrough();
    const prompter = createPrompter(input as any, output as any);
    return { input, output, prompter };
}

describe('createPrompter', () => {
    it('resolves questions in order from buffered lines', async () => {
        const { input, prompter } = setup();
        input.write('alpha\nbravo\n');
        await expect(prompter.question('A: ')).resolves.toBe('alpha');
        await expect(prompter.question('B: ')).resolves.toBe('bravo');
        prompter.close();
    });

    it('waits for a line that arrives after the question is asked', async () => {
        const { input, prompter } = setup();
        const p = prompter.question('Q: ');
        input.write('later\n');
        await expect(p).resolves.toBe('later');
        prompter.close();
    });

    it('resolves pending questions with empty string when input closes', async () => {
        const { input, prompter } = setup();
        const p = prompter.question('Q: ');
        input.end();
        await expect(p).resolves.toBe('');
    });
});
