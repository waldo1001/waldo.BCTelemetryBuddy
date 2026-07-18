---
spec: 130-multiroot-wizard-support
issue: 130
status: approved
created: 2026-07-18
approved: 2026-07-18
plans: []
---

# Spec: Multi-root workspace support in the setup/profile/agent wizards

## Intent
The extension's *consumers* (MCP launch, KB webview, queries) already support multi-root workspaces via `findConfigWorkspace()` (first folder containing `.bctb-config.json` wins). But the *creators* don't: the Setup wizard hard-blocks multi-root with an obsolete error, and the Profile/Agent wizards silently write to `workspaceFolders[0]` — which can be a different folder than the one consumers read from. Wizards and consumers must resolve the same folder, and multi-root must not be blocked.

## Actors & scope
Extension users with multi-root workspaces; the three webview wizards (`SetupWizardProvider`, `ProfileWizardProvider`, `AgentMonitoringSetupProvider`). Package: `packages/extension` only.
- IN: wizard folder resolution + un-blocking multi-root + telemetry for the resolution outcome
- OUT: see Non-goals

## Behavior
All three wizards resolve their target workspace folder through the existing `findConfigWorkspace()` service (`packages/extension/src/services/workspaceFinder.ts`) — the same resolver used to launch the MCP server and load the Knowledge Base. Resolution semantics are **unchanged**: first workspace folder (in workspace order) containing `.bctb-config.json`; fallback to the first folder when none has a config. The Setup wizard's multi-root blocking UI is removed.

## Acceptance criteria
- **AC1:** Given a multi-root workspace, When the Setup wizard opens, Then workspace validation passes (no multi-root block, Next enabled) and load/save use the folder resolved by `findConfigWorkspace()`.
- **AC2:** Given a multi-root workspace where `.bctb-config.json` exists only in a non-first folder, When the Profile wizard loads or saves, Then it reads/writes that folder's `.bctb-config.json` (the same folder the MCP server and KB webview use).
- **AC3:** Given the same setup, When the Agent Monitoring setup checks prerequisites, Then its workspace path is the `findConfigWorkspace()` result, not `workspaceFolders[0]`.
- **AC4:** Given a single-folder workspace, When any wizard runs, Then behavior is byte-identical to today (regression guard).
- **AC5:** Given any wizard resolves a workspace folder, When resolution completes, Then a telemetry event records the outcome (`singleRoot` | multi-root resolved | fallback) with **no folder paths or PII** in properties (Rule 13; see the `multiRootResolved` precedent in `KnowledgeBaseProvider`).

## Non-goals
- **Name-based priority folder detection** (`telemetry` > `monitoring` > `analytics` > `insights`): deferred. It silently changes the active MCP connection for existing multi-root users and conflicts with the MCP side's "don't guess when ambiguous" design (connection discovery registers candidates but never auto-activates when >1). If wanted, it gets its own spec — likely as an explicit prompt or opt-in setting instead of magic names.
- Config file format changes, auth changes, MCP-server-side changes.
- Dependency bumps (`applicationinsights`) — npm audit is handled separately by the maintainer.

## Telemetry (Rule 13)
One extension event per wizard resolution outcome, per AC5. Exact event ID assigned in the plan (`TELEMETRY_EVENTS.EXTENSION`).

## Verification
| AC | Test | Status |
|---|---|---|
| AC1 | planned | planned |
| AC2 | planned | planned |
| AC3 | planned | planned |
| AC4 | planned | planned |
| AC5 | planned | planned |

## Links
- Issue: #130
- PR: #127
- Plan (in PR): `docs/plans/multiroot-workspace-unrestrict.md`
