/**
 * #150 AC11: agent-facing text no longer says tenantId is ignored for azure_cli.
 * Spec: docs/specs/150-azure-cli-tenant.md
 */
import { ToolHandlers } from '../tools/toolHandlers.js';
import { SETUP_PROMPT_CONTENT } from '../tools/setupInstructions.js';

describe('azure_cli tenant wording', () => {
    function switchResult(authFlow: string): any {
        const fakeThis = { config: { authFlow, connectionName: 'c', applicationInsightsAppId: 'a' }, configErrors: [] };
        return (ToolHandlers.prototype as any).buildSwitchResult.call(fakeThis, 'previous', 'next', 'file');
    }

    it('AC11: the switch_profile note says the token is requested for tenantId', () => {
        const { note } = switchResult('azure_cli');

        expect(note).not.toContain('not used');
        expect(note).toContain("requests the token for this profile's tenantId");
    });

    it('AC11: the switch_profile note stays limited to azure_cli', () => {
        expect(switchResult('device_code').note).toBeUndefined();
    });

    it('AC11: the setup prompt says azure_cli requests its token for the tenant', () => {
        expect(SETUP_PROMPT_CONTENT).toContain('azure_cli requests its token for this tenant');
        expect(SETUP_PROMPT_CONTENT).toContain('default az tenant');
    });
});
