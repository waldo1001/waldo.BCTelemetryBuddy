---
spec: 131-query-telemetry-embedded-resources
issue: 131
status: approved
created: 2026-07-18
approved: 2026-07-18
plans: [docs/plans/pr108-embedded-resources-remediation.md]
---

# Spec: query_telemetry embedded resources (CSV/JSON export files via MCP resources)

## Intent
Large `query_telemetry` result sets returned inline as JSON bloat the model context. Agents with a code interpreter should be able to receive results as file resources (CSV/JSON) — an MCP `resources`-capability pattern aligned with the Microsoft BC MCP 2026 Wave 1 direction. This is also the first implementation of MCP resources in this server (relates to the ambitions of #83/#84/#85).

## Actors & scope
MCP clients (Claude Code, Copilot agent mode, any resources-capable host); packages `shared` (export engine) and `mcp` (resource registration + tool result shaping).
- IN: opt-in `resultFormat: "resource"` on `query_telemetry`; export files under `.vscode/.bctb/exports/`; `bctb://exports/{filename}` resource template; cleanup; telemetry
- OUT: see Non-goals

## Behavior
`query_telemetry` gains two optional parameters: `resultFormat` (`"text"` default | `"resource"`) and `fileFormat` (`"csv"` default | `"json"`). In resource mode the result is written to `{workspace}/.vscode/.bctb/exports/` and the tool response carries a short text summary plus an MCP embedded-resource block. Exported files are listable and readable via the registered resource template `bctb://exports/{filename}` and expire after 24 hours. The exports directory is git-ignored (exported telemetry can contain real tenant data).

## Acceptance criteria
- **AC1:** Given a `query_telemetry` call without `resultFormat`, When it succeeds, Then the response is a single inline-text block, byte-compatible with today (backward-compatible default).
- **AC2:** Given `resultFormat: "resource"` with a tabular result, When the query succeeds, Then the response contains a text summary ("N row(s), M column(s)") plus a `type: "resource"` block with `mimeType: "text/csv"`, and the `.csv` file exists under `.vscode/.bctb/exports/`.
- **AC3:** Given `resultFormat: "resource", fileFormat: "json"` (or a non-tabular result), When the query succeeds, Then the resource is `application/json` and the file content is the serialized result envelope.
- **AC4:** Given prior exports, When a client calls `resources/list` and `resources/read` on `bctb://exports/{filename}`, Then it receives the listing and exact content; And a filename escaping the exports directory (path traversal) is rejected as not-found.
- **AC5:** Given the server starts with an export service, When capabilities are read, Then `resources` is advertised and exactly one template (`telemetry-export`) is registered; without an export service, none is.
- **AC6:** Given export files older than 24h, When the server starts or a new export completes, Then they are removed — including on filesystems without reliable `birthtime`.
- **AC7:** Given any resource-mode response, When the embedded resource block is emitted, Then its URI is the `bctb://exports/{filename}` form — never a `file://` absolute path (no local filesystem layout leaks into model context).
- **AC8:** Given a resource export completes, When telemetry is inspected, Then exactly one dedicated event fires with `fileFormat`, `rowCount`, `columnCount` — and no raw query data or paths (Rule 13; note: the PR's original event ID `TB-MCP-113` now collides with `DEPRECATED_TOOL_CALLED` on main and must be renumbered).

## Non-goals
- Size caps / truncation for very large exports (candidate follow-up: the context-saving claim only fully holds when the host stores resources by reference).
- Resources for other tools (`get_event_catalog` etc.) — future work under #83/#84/#85.
- Changing the inline-text default or the result envelope.

## Telemetry (Rule 13)
One dedicated MCP tool event per export (see AC8). Exact renumbered ID assigned in the plan.

## Verification
| AC | Test | Status |
|---|---|---|
| AC1 | planned | planned |
| AC2 | planned | planned |
| AC3 | planned | planned |
| AC4 | planned | planned |
| AC5 | planned | planned |
| AC6 | planned | planned |
| AC7 | planned | planned |
| AC8 | planned | planned |

## Links
- Issue: #131
- PR: #108
- Related: #83, #84, #85
