CHANGELOG
=========

This changelog is automatically appended with merged PR metadata (title, author, date, summary) by the GitHub Action `log-changes.yml`. Manual edits are allowed for retrospective notes but prefer PR-driven updates.

Recent entries
--------------

- 2025-10-15 16:35 — Cleaned up Instructions.md — Removed 200+ lines of duplicate and outdated conversational content (chat-driven)
- 2025-10-15 16:45 — Added technical implementation specifications to Instructions.md — Documented NL-to-KQL search flow, JSON-RPC protocol, monorepo structure, extension naming, logging, workspace discovery, TypeScript config (chat-driven)
- 2025-10-15 16:55 — Added development standards to Copilot instructions — Requires tests for all code (MCP + extension), user documentation (UserGuide.md), and component CHANGELOGs with semantic versioning (chat-driven)
- 2025-10-15 16:57 — Added SOLID principles and best practices to Copilot instructions — Enforce SRP, OCP, LSP, ISP, DIP, DRY, KISS, YAGNI, type safety, error handling, separation of concerns, and code organization standards (chat-driven)
- 2025-10-15 17:02 — Created monorepo structure — Root package.json with workspaces, tsconfig.json (ES2022+ESM), .gitignore, README.md, packages/mcp (Express+MSAL+Jest), packages/extension (VSCode manifest+settings), component CHANGELOGs (chat-driven)
- 2025-10-15 17:05 — Created UserGuide.md with 13 sections for end users — documents installation, setup, authentication, querying, saving, references, Copilot integration, configuration, troubleshooting, FAQ (chat-driven)
- 2025-01-14 17:32 — Created comprehensive test suite for MCP backend (7 test files, 139 tests, 74.64% coverage) — Ensures code quality before manual testing (chat-driven)
- 2025-10-15 18:00 — Created Jest test suite for VSCode extension (3 test files, 56 tests, 100% coverage on testable modules) — Validates extension logic with unit tests (chat-driven)
- 2025-10-15 18:30 — Created E2E test script for manual testing (docs/E2E-TestScript.md) — Comprehensive testing guide with 10 sections covering workspace setup, MCP lifecycle, queries, caching, edge cases, Copilot integration, and success criteria (chat-driven)
- 2025-10-15 18:45 — Created GitHub Actions CI/CD workflows (6 workflows + dependabot + labeler) — Automated testing on Node 18.x/20.x, multi-OS extension tests, CodeQL security, dependency review, auto-labeling, marketplace publishing (chat-driven)
- 2025-10-15 19:00 — Added rule to prohibit automated git operations in Copilot instructions — Agent must never execute git commands (commit, push, pull, merge, etc.) without explicit user request; user maintains full control over repository history (chat-driven)
- 2025-10-15 19:05 — Fixed CI failure: Added missing test:coverage script to MCP package.json — CI was calling npm run test:coverage which didn't exist; added "test:coverage": "jest --coverage" (chat-driven)
- 2025-10-15 19:10 — Documented lack of integration tests — All 195 tests (139 MCP + 56 extension) are unit tests with mocked boundaries; integration test infrastructure exists but empty; recommend manual E2E testing first (chat-driven)
- 2025-10-15 19:15 — Fixed CI build failures: packaging issues — Added npm install --production to package script to fix axios missing dependency; added repository field to extension package.json; fixed broken relative link in README to absolute GitHub URL; created .vscodeignore to exclude src/tests/coverage (reduced package from 435 to 399 files, 934KB to 887KB) (chat-driven)
- 2025-10-15 19:20 — Added waldo.png as extension icon — Updated extension package.json with icon: "images/waldo.png"; verified packaging includes 34.24KB icon file; final package: 400 files, 888.3KB (chat-driven)
- 2025-10-15 19:25 — Fixed non-interactive packaging for CI — Added --skip-license flag to vsce package command to prevent interactive prompt that blocks CI builds (chat-driven)
- 2025-10-15 19:30 — Added MIT LICENSE to project — Created LICENSE file at root and packages/extension/LICENSE for marketplace publishing; removed --skip-license flag; verified packaging includes LICENSE.txt with no warnings (chat-driven)
- 2025-10-15 19:35 — Resumed logging all prompts to PromptLog.md — Backfilled missing Entries #38-44 covering CI investigations, integration test question, logo addition, license request, and meta-prompt about logging (chat-driven)
- 2025-10-15 19:40 — Updated DesignWalkthrough.md with missing entries — Added 7 missing entries (Prompts #37-44) covering git operation prohibition, CI fixes, integration test documentation, icon addition, packaging fixes, and LICENSE (chat-driven)
- 2025-10-15 19:45 — Updated CHANGELOG.md with missing entries — Added 9 missing timestamped entries (19:00-19:40) covering same period as DesignWalkthrough updates (chat-driven)
- 2025-10-15 19:50 — Fixed CI build: vsce not found error — Removed `npm install --production` from package script; CI's earlier `npm ci` already installs devDependencies including @vscode/vsce; production install was excluding vsce and breaking build (chat-driven)
- 2025-10-15 20:00 — Fixed CI build: vsce parent directory traversal — Added `../` and `../../` to .vscodeignore to prevent vsce from including workspace root and .git folder; reduced package from 627 files to 400 files; fixed "invalid relative path: extension/../../.git/config" error (chat-driven)
- 2025-10-15 20:15 — Created VSCode launch and tasks configurations — Added .vscode/launch.json with 4 debug configurations (Run Extension, Watch Mode, Tests, Debug MCP) and compound launch for both; added .vscode/tasks.json with build/test tasks for monorepo; enables F5 debugging from workspace root (chat-driven)
- 2025-10-15 17:20 — Scaffolded complete VSCode extension with 3 modules — extension.ts (commands, MCP lifecycle, auto-start), mcpClient.ts (JSON-RPC client with retries), resultsWebview.ts (HTML results display with tables/recommendations) — verified compilation (chat-driven)
- 2025-10-15 16:30 — Removed outdated "tell me your choices" text from Instructions.md — Cleaned up outdated interactive prompt text; Instructions.md is now complete reference documentation ready for implementation (chat-driven)
- 2025-10-15 16:25 — Finalized implementation decisions in Instructions.md — Documented all architectural choices: file-based cache, device_code auth (primary), few-shot prompting with GitHub Copilot, GitHub API for external references, no embeddings, webview UI, automatic MCP registration, configurable retry count, opt-in PII sanitization, strict .kql format; added new settings and saved query format specification (chat-driven)
- 2025-10-15 15:50 — Added external reference support to Instructions.md — MCP can now fetch KQL examples from GitHub repos and blogs to maximize context for NL-to-KQL translation; added workspace settings, new references.ts module, rate limiting, and caching (chat-driven)
- 2025-10-15 15:35 — Updated Copilot instructions to log ALL prompts immediately — Made prompt logging the first step in workflow; all user interactions (questions, changes, etc.) now logged to PromptLog.md before any other action (chat-driven)
- 2025-10-15 15:25 — Fixed timestamps in PromptLog.md and backfilled missing prompts — Replaced "[Current Time]" placeholders with exact timestamps; added Entry #5 (chat-driven)
- 2025-10-15 15:20 — Updated Copilot instructions to enforce logging ALL user prompts — Made prompt logging mandatory for every change with sequential entry numbers; prompts logged first to enable cross-referencing from DesignWalkthrough.md (chat-driven)
- 2025-10-15 15:10 — Changed saved queries to .kql files and added MCP tool definitions — MCP now discovers and uses saved .kql files as context for NL-to-KQL translation; added explicit MCP tool definitions for Copilot integration (chat-driven)
- 2025-10-15 14:50 — Added prompt logging to Copilot instructions and created `docs/PromptLog.md` — Captures user prompts as metadata with cross-references to DesignWalkthrough.md (chat-driven)
- 2025-10-15 14:45 — Created `.github/copilot-instructions.md` — Instructs Copilot to ask 'why' and log every change to docs (chat-driven)
- 2025-10-15 — Initial full-solution instructions added (see `Instructions.md`).
