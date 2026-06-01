import { SETUP_PROMPT_CONTENT } from '../tools/setupInstructions.js';

describe('SETUP_PROMPT_CONTENT', () => {
    it('is a non-empty workflow document', () => {
        expect(typeof SETUP_PROMPT_CONTENT).toBe('string');
        expect(SETUP_PROMPT_CONTENT.length).toBeGreaterThan(500);
    });

    it('covers the full setup workflow steps', () => {
        const text = SETUP_PROMPT_CONTENT.toLowerCase();
        expect(text).toContain('authenticat');      // auth step
        expect(text).toContain('application insights'); // endpoint discovery
        expect(text).toContain('.bctb-config.json'); // config write target
        expect(text).toContain('reload');            // advise reload at the end
    });

    it('references all four auth flows', () => {
        for (const flow of ['azure_cli', 'vscode_auth', 'device_code', 'client_credentials']) {
            expect(SETUP_PROMPT_CONTENT).toContain(flow);
        }
    });

    it('references both helper-script commands AND the manual fallback', () => {
        expect(SETUP_PROMPT_CONTENT).toContain('bctb-setup-endpoints');
        expect(SETUP_PROMPT_CONTENT).toContain('bctb-setup-write-config');
        // manual fallback path when az is unavailable / enumeration empty
        expect(SETUP_PROMPT_CONTENT.toLowerCase()).toContain('manual');
    });

    it('mentions multi-root workspace folder selection', () => {
        expect(SETUP_PROMPT_CONTENT.toLowerCase()).toContain('multi-root');
    });

    it('contains no real-looking tenant/app GUIDs (security)', () => {
        // Any non-zero hex GUID would be a leaked identifier. Placeholders must be all-zero or angle-bracket tokens.
        const guidRegex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
        const guids = SETUP_PROMPT_CONTENT.match(guidRegex) || [];
        for (const g of guids) {
            expect(g.replace(/[0-]/g, '')).toBe('');
        }
    });
});
