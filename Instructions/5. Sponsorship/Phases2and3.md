# Sponsorship Implementation — Phases 2 & 3

Sponsor URL: `https://github.com/sponsors/waldo1001`  
Tone: Value-based — *"This tool helps businesses extract value from BC telemetry data; keeping it free takes time."*

---

## Phase 2 — Passive Static UI

These changes are visible only when the user is already on the relevant screen. No popups, no interruptions.

### Step 1: ReleaseNotesProvider — Resources section

**File:** `packages/extension/src/webviews/ReleaseNotesProvider.ts`  
**Location:** The `📚 Resources` section (around `<h2><span class="emoji">📚</span> Resources</h2>`).

Add a 4th link **after** "Report Issues":

```html
<a href="https://github.com/sponsors/waldo1001">Support the developer</a> — 
This tool helps businesses extract value from BC telemetry data; keeping it free takes time.
```

---

### Step 2: SetupWizardProvider — Next Steps section (final step)

**File:** `packages/extension/src/webviews/SetupWizardProvider.ts`  
**Location:** Step 5 "Save Configuration" — the "Next Steps" section at the bottom (~L1099–1110).

Add at the **bottom** of that section, before the closing tag:

```html
<p style="margin-top: 1rem; font-size: 0.9em; color: var(--vscode-descriptionForeground);">
  If BC Telemetry Buddy saves your team time or helps drive business decisions,
  <a href="https://github.com/sponsors/waldo1001">supporting the developer</a>
  keeps the project alive and maintained.
</p>
```

---

### Step 3: README badges

**Files:** `packages/extension/README.md` and `packages/mcp/README.md`

Add after the existing badges at the top of each file:

```markdown
[![Sponsor](https://img.shields.io/github/sponsors/waldo1001?label=Sponsor&logo=GitHub)](https://github.com/sponsors/waldo1001)
```

---

## Phase 3 — Smart One-Time Usage Notification

Fires **once ever** after the user has run 50 queries. Set before showing so it never fires twice — even if the user force-quits the window.

### Step 4: Track query count in globalState

**File:** `packages/extension/src/extension.ts`  
**Where:** In the command handler(s) that call `executeKQL()` (or equivalent telemetry service calls), immediately after a successful result is returned.

Add after the success path:

```typescript
const queryCount = (context.globalState.get<number>('bctb.queryCount') ?? 0) + 1;
await context.globalState.update('bctb.queryCount', queryCount);
await maybShowSponsorPrompt(context, queryCount);
```

---

### Step 5: Implement `maybShowSponsorPrompt`

Add this function near the other utility functions in `extension.ts` (or extract to a new `sponsorService.ts`):

```typescript
async function maybShowSponsorPrompt(
    context: vscode.ExtensionContext,
    queryCount: number
): Promise<void> {
    const THRESHOLD = 50;
    if (queryCount < THRESHOLD) { return; }
    if (context.globalState.get<boolean>('bctb.sponsorPromptShown')) { return; }

    // Mark shown BEFORE displaying to prevent re-triggering if user dismisses the window
    await context.globalState.update('bctb.sponsorPromptShown', true);

    const action = await vscode.window.showInformationMessage(
        `You've run ${queryCount}+ queries — BC Telemetry Buddy is clearly part of your workflow. ` +
        `If it helps your business, supporting development keeps it free and maintained.`,
        '❤️ Sponsor',
        'Not now'
    );

    if (action === '❤️ Sponsor') {
        await vscode.env.openExternal(vscode.Uri.parse('https://github.com/sponsors/waldo1001'));
    }
}
```

**Key constraints:**
- `bctb.sponsorPromptShown` is set to `true` regardless of which button is pressed — notification fires **once ever**
- Threshold: 50 queries
- Do **not** reset `bctb.sponsorPromptShown` on extension update or version change

---

## globalState keys introduced

| Key | Type | Purpose |
|-----|------|---------|
| `bctb.queryCount` | `number` | Running total of successful queries |
| `bctb.sponsorPromptShown` | `boolean` | Whether the one-time notification has fired |

---

## Verification Checklist

- [ ] Run 50 mock queries → notification appears once with correct text
- [ ] Click "❤️ Sponsor" → browser opens `https://github.com/sponsors/waldo1001`
- [ ] Click "Not now" on a fresh install → notification does **not** appear again on restart
- [ ] Restart VS Code after notification → notification does **not** appear again
- [ ] Open SetupWizard, reach step 5 → sponsor sentence visible at the bottom
- [ ] Run `bctb.showReleaseNotes` command → sponsor link appears in Resources section
- [ ] Both README files show the Sponsors badge
- [ ] npm package page for `bc-telemetry-buddy-mcp` shows "Fund" button (after next publish)
