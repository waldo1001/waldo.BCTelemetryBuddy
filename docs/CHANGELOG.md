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
- 2025-01-14 17:15 — Scaffolded complete MCP backend implementation with 7 modules — config, auth (MSAL), kusto (query execution), cache (file-based), sanitize (PII), queries (.kql parsing/searching), references (GitHub API), server (Express + JSON-RPC 2.0) — verified compilation (chat-driven)
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
