---
topic: guided-setup-cli
status: done
created: 2026-06-01
---

## Task
Add an interactive `bctb-setup` CLI that walks the user (via Azure CLI) from start to finish to produce `.bctb-config.json`, and a Setup Wizard button that launches it in VS Code's integrated terminal.

## Scope boundary
- IN: new interactive `bctb-setup` bin (MCP package); a "Guided setup (Azure CLI)" button + handler in `SetupWizardProvider`; reuse existing `endpointDiscovery` / `configMerge` / `validateTargetFolder`; a tested `parseSelection` helper; telemetry for the launch.
- OUT: removing the existing `setup-connection` prompt / `get_setup_guide` tool (left in place, harmless); changing config schema.

## Files
- CREATE `packages/mcp/src/setup/parseSelection.ts` (+ test) — parse a "pick a number" answer → 0-based index | null.
- CREATE `packages/mcp/src/scripts/setup.ts` — interactive CLI (readline) orchestrating az check/login → discover → pick → folder → write.
- TOUCH `packages/mcp/package.json` — `bin: bctb-setup` + add `setup.ts` to `build:scripts` esbuild.
- TOUCH `packages/extension/src/webviews/SetupWizardProvider.ts` — button + `runGuidedSetup` message handler (creates terminal, runs `npx -p bc-telemetry-buddy-mcp@latest bctb-setup --folder <chosen>`); multi-root → QuickPick folder.
- TOUCH `packages/extension/src/extension.ts` — pass `usageTelemetry` into `SetupWizardProvider` (for the launch event).
- TOUCH `packages/shared/src/telemetryEvents.ts` — `EXTENSION.GUIDED_SETUP_LAUNCHED = 'TB-EXT-020'`.

## Interface
- `parseSelection(input: string, count: number): number | null` — 1..count → index; else null.
- `bctb-setup [--folder <path>]` — interactive; defaults folder to cwd; azure_cli auth; manual App-ID fallback; confirms before write.

## RED tests
- AC1: `parseSelection` maps "1"→0, "3"→2 (count 3); rejects "0", ">count", "abc", "" → null; trims whitespace.
- (Interactive script + wizard button verified by build + a piped-stdin smoke run; they are integration entry points, excluded from coverage like `cli.ts`.)

## Telemetry (Rule 13)
- `EXTENSION.GUIDED_SETUP_LAUNCHED` = `'TB-EXT-020'`, fired in `SetupWizardProvider.runGuidedSetup`. Props: `{ isMultiRoot }`. No PII.

## Blast radius / breakage prediction
- **Rating:** `low-risk` — net-new bin + button; existing tools/commands/config format unchanged. Wizard gains a button; `extension.ts` change is an additive constructor arg.
- **Who/what could break:** extension users (new button). Not: query path, MCP tools, config readers.
- **Detection:** `parseSelection` test; build; a regression would show as the button erroring or the script crashing in a smoke run.

## Out-of-scope follow-ups
- Optionally retire the MCP `setup-connection` prompt / `get_setup_guide` tool once the button is the blessed path.
