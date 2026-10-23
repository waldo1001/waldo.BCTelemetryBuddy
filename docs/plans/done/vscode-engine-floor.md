---
topic: vscode-engine-floor
status: done
created: 2026-10-23
spec: spec-lite
---

# Extension: declare the real minimum VS Code version (1.101.0)

## Spec-lite
- Intent: `engines.vscode` says `^1.96.0`, but since `c39b4ea` (2025-10-16) `activate()` calls `vscode.lm.registerMcpServerDefinitionProvider` unguarded. Verified in real VS Code via `@vscode/test-electron` (2026-10-23): **1.96.0** → `registerMcpServerDefinitionProvider is not a function`; **1.100.3** → `CANNOT use API proposal: mcpConfigurationProvider`; **1.101.0** and **1.143.1** → activate, start the Command Palette server, token 401 / Origin 403 as specified. The extension is dead on 1.96–1.100 and the Marketplace still offers it there.
- **AC1:** Given the extension manifest, When the Marketplace or VS Code checks compatibility, Then `engines.vscode` is `^1.101.0` (VS Code 1.96–1.100 are offered the last version that declared them, instead of a version that cannot activate).
- **AC2:** Given `@types/vscode` and the integration-test pin in `src/test/runTest.ts`, Then both match the engine floor (`^1.101.0` / `'1.101.0'`), so the compiler and the test harness use the APIs the floor guarantees.
- Eligibility: bugfix, blast radius `low-risk`.

## Task
Raise the declared VS Code minimum to 1.101.0 everywhere it is stated, guarded by a consistency test.

## Scope boundary
- IN: `packages/extension/package.json` (`engines.vscode`, `@types/vscode` range), `packages/extension/src/test/runTest.ts` pin, `docs/UserGuide.md` prerequisite line, extension CHANGELOG, consistency test.
- OUT: feature-detecting the API to keep 1.96–1.100 alive (those versions are 16+ months old; the MCP provider, Copilot tools and chat participant are the product); upgrading `@vscode/test-electron` (only needed for builds that name the binary `Code`, a test-harness concern).

## Files to create / touch
- `packages/extension/package.json`
- `packages/extension/src/test/runTest.ts`
- `packages/extension/src/__tests__/vscode-engine-floor.test.ts` (new)
- `docs/UserGuide.md` (line 101)
- `packages/extension/CHANGELOG.md`, `docs/DesignWalkthrough.md`

## Interface
None.

## Dependencies
None (installed `@types/vscode` is already 1.106.1; the range change does not require a lockfile change beyond the range string, verified with `npm ci` in CI).

## RED test list
- AC1: "AC1: engines.vscode is ^1.101.0 (registerMcpServerDefinitionProvider is stable from 1.101)" — reads package.json; also asserts `extension.ts` still uses `registerMcpServerDefinitionProvider` (if it is ever removed, the floor can be revisited)
  - test file: packages/extension/src/__tests__/vscode-engine-floor.test.ts
  - seams touched: none
- AC2: "AC2: @types/vscode and the integration-test pin match the engine floor"

## Telemetry (Rule 13)
Not applicable: manifest metadata only, no runtime behavior change.

## Open questions / assumptions
- Assumption: no meaningful user base on VS Code 1.96–1.100 (they could not activate any release since Oct 2025 anyway).

## Risks
- `vsce package` refuses when `@types/vscode` is newer than `engines.vscode`; both move to 1.101 together, so packaging stays valid. Detected by the release workflow's package step.

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - Users on VS Code ≥ 1.101: no change. Users on 1.96–1.100: stop receiving updates they could not run anyway.
  - Rollback = revert one commit.
- **Who/what could break:** extension packaging (vsce engine/types check), CI.
- **Detection:** consistency test; `vsce package` in the release workflow; Marketplace listing shows "VS Code ^1.101.0".

## Follow-up after this lands (approved together, per waldo 2026-10-23 "do it all")
Release both components with the release skill: **MCP 3.8.0** (#145 + #147, BREAKING notes in CHANGELOG) and **extension 3.5.0** (#147 token flow + this fix). Verify npm `latest` and the Marketplace version afterwards.

## Out-of-scope follow-ups
- Replace the placeholder `src/test/suite/index.ts` with a real integration test (the scratch suite used for this verification: activate → `bctb.startMCP` → token 401 / Origin 403), and upgrade `@vscode/test-electron` so it can launch current VS Code builds.
