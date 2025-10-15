Design Walkthrough — Building the Business Central Telemetry Buddy
================================================================

Purpose
-------
This document records the end-to-end design decisions, trade-offs, and step-by-step development process used to build the MCP + VSCode extension solution. It's written for a "vibe-code" presentation: show how to prototype, validate, and iterate quickly while keeping security and auditability in mind.

Sections
--------
1. Goals & constraints — what we wanted to achieve and the non-negotiables.
2. Architecture sketch — components and data flows.
3. Stepwise implementation log — chronological steps taken, why, and alternatives considered.
4. Hardening & production notes — auth, secrets, caching choices.
5. Future improvements & experiments — roadmap items and research notes.

How to use this doc
-------------------
- Keep it updated as you implement features: for each merged PR, add a short note (1–3 lines) explaining "why" the change was made and "how" it was implemented (links to code/PR).
- Use the PR templates and commit conventions (see `CONTRIBUTING.md`) to ensure Copilot or contributors add the required metadata and explanations.

Short example entry (for slides)
--------------------------------
- 2025-10-15: Added MCP JSON contract and workspace settings. Why: define a small, explicit data contract for agents to consume. How: added `Instructions.md` and `DesignWalkthrough.md` with examples.

Stepwise implementation log
----------------------------

- **2025-10-15** — Created `.github/copilot-instructions.md`. [Prompt #1]
  - **Why:** User wants Copilot to always ask "why" for each change and log every action to docs, so the project evolution can be presented in a session later.
  - **How:** Added persistent Copilot instructions that enforce asking for context, logging changes to `docs/DesignWalkthrough.md` and `docs/CHANGELOG.md` automatically.

- **2025-10-15** — Added prompt logging to Copilot instructions. [Prompt #2]
  - **Why:** Capture user prompts as metadata to show conversational flow and how to replicate the development process for presentation.
  - **How:** Updated `.github/copilot-instructions.md` to log prompts to `docs/PromptLog.md`, created PromptLog.md with numbered entries, added cross-references between DesignWalkthrough.md and PromptLog.md.

- **2025-10-15** — Changed saved queries from JSON to .kql files; MCP uses them as context. [Prompt #3]
  - **Why:** User wants human-readable, version-controllable saved queries that the MCP automatically discovers and uses as examples when translating natural language to KQL. This enables team knowledge sharing and transparent self-learning.
  - **How:** Updated Instructions.md to use `.vscode/bctb/queries/*.kql` files with formatted comments (purpose, tags, created date). MCP scans folder, parses files, extracts metadata, and injects saved queries as context for NL-to-KQL translation. Added `queries.ts` module, updated `/saved` endpoint to read/write .kql files, added MCP tool definitions for Copilot integration, clarified that MCP follows standard community MCP pattern.

- **2025-10-15** — Updated Copilot instructions to enforce logging ALL prompts. [Prompt #4]
  - **Why:** User noticed prompts were not being consistently logged; need complete prompt history for presentation.
  - **How:** Updated `.github/copilot-instructions.md` to make prompt logging mandatory for EVERY change (not just major features), clarified workflow to log prompt FIRST (to get entry number), then reference it in DesignWalkthrough.md with `[Prompt #N]`, added emphasis that ALL user requests resulting in changes must be logged.

- **2025-10-15** — Fixed timestamps in PromptLog.md and backfilled missing prompts. [Prompt #5]
  - **Why:** User noticed "[Current Time]" placeholders instead of exact timestamps; need precise timestamps for accurate conversation history tracking.
  - **How:** Replaced all "[Current Time]" placeholders with actual timestamps (14:50, 15:10, 15:20, 15:25); backfilled Entry #5 for this prompt.

- **2025-10-15** — Updated Copilot instructions to log ALL prompts immediately. [Prompt #7]
  - **Why:** User noticed prompts (including questions) were still not being logged consistently; need to log EVERY user interaction, not just change requests.
  - **How:** Updated `.github/copilot-instructions.md` to make prompt logging the FIRST step in workflow (before any other action), expanded "significant" definition to include ANY user prompt/question, added critical rule that EVERYTHING gets logged to PromptLog.md immediately, backfilled missing Entry #6 (question about .kql context).

- **2025-10-15** — Added external reference support to Instructions.md. [Prompt #10]
  - **Why:** User emphasized importance of providing maximum context to MCP for accurate KQL generation; relying only on workspace .kql files limits context, especially for new users or teams. External references (GitHub repos, blogs) provide rich additional examples.
  - **How:** Added `bctb.mcp.references` array to workspace settings (GitHub and web types), created new `src/references.ts` module specification, updated `/query` endpoint with `includeExternal` parameter, expanded "Self-learning" section to "Self-learning & context sources" with three tiers (workspace queries, external references, embeddings), added rate limiting and caching for external fetches, updated Copilot tool definition to document external context usage.

- **2025-10-15** — Finalized implementation decisions in Instructions.md. [Prompt #16, #17]
  - **Why:** Before scaffolding code, needed to clarify all architectural decisions (cache backend, auth flow, NL-to-KQL strategy, external references, embeddings, UI, MCP lifecycle, error handling, PII sanitization, query format) to avoid making assumptions that misalign with user's vision.
  - **How:** Asked 12 clarification questions covering critical and deferrable decisions. User provided comprehensive answers: (1) file-based cache, (2) device_code auth primary with client_credentials documented, (3) few-shot prompting with GitHub Copilot using folder/filename filtering then LLM similarity, (4) GitHub API first, (5) no embeddings, (6) marketplace extension, (7) auto-start MCP, (8) webview UI, (9) automatic MCP registration, (10) expose query failures with configurable retry count, (11) opt-in PII sanitization for cache + LLM, (12) strict .kql format. Added "Implementation decisions (finalized)" section to Instructions.md documenting all choices, new settings (`bctb.agent.maxRetries`, `bctb.mcp.sanitize.removePII`), and strict saved query file format with comment header specification.

- **2025-10-15** — Removed outdated "tell me your choices" text from Instructions.md. [Prompt #18]
  - **Why:** User noticed outdated text asking for cache/auth choices that were already finalized in previous entry. Instructions.md should be clean reference documentation, not contain interactive prompts.
  - **How:** Replaced outdated closing section with "Ready for implementation" heading confirming all decisions are finalized and ready for scaffolding.

- **2025-10-15** — Cleaned up Instructions.md to professional reference document. [Prompt #19]
  - **Why:** Remove all conversational/draft content and create clean, implementation-ready instructions containing all finalized decisions.
  - **How:** Removed duplicate "original requirements" section at end (over 100 lines), removed duplicate "MCP plan" section, removed "Next steps" conversational prompts, consolidated to single clean Change Log, formatted all JSON examples with proper code blocks, added key settings explanations, kept only implementation decisions section with all 12 finalized choices.

- **2025-10-15 16:45** — Added technical implementation specifications to Instructions.md. [Prompt #21]
  - **Why:** Final clarifications revealed implementation-specific details not captured in architectural decisions (NL-to-KQL flow, JSON-RPC protocol type, monorepo structure, naming, etc.). These needed to be documented before scaffolding to eliminate ambiguity.
  - **How:** Created new "Technical implementation specifications" section in Instructions.md with 10 clarifications: (1) MCP searches queries by content/filename (doesn't translate NL to KQL), LLM generates KQL; (2) formal MCP JSON-RPC protocol (not REST); (3) monorepo with packages/mcp + packages/extension, single build; (4) extension naming (BC Telemetry Buddy / bc-telemetry-buddy / waldo); (5) GitHub API unauthenticated (60 req/hr); (6) web scraping deferred to v2; (7) console + Output Channel logging; (8) workspace path via env var; (9) one MCP per workspace; (10) ES2022 + ESM. Updated NL-to-KQL decision (#3) in main section to clarify search-based collaborative approach between MCP and LLM.

- **2025-10-15 16:55** — Added development standards to Copilot instructions. [Prompt #24]
  - **Why:** Before scaffolding code, need to establish strict guidelines for test coverage and documentation maintenance to ensure quality and usability of the solution.
  - **How:** Added two new sections to `.github/copilot-instructions.md`: (8) Always create tests — requires tests for every module/feature, runnable via npm scripts, using Jest/Mocha for MCP and VSCode test framework for extension; (9) Maintain comprehensive documentation — three levels: UserGuide.md (user-facing setup/usage), component CHANGELOGs (MCP and extension version history with semantic versioning), and existing developer docs. Tests must be created in same commit as code. Documentation updates required whenever user-facing features change.

- **2025-10-15 16:57** — Added SOLID principles and best practices to Copilot instructions. [Prompt #25]
  - **Why:** Ensure code quality, maintainability, and adherence to software engineering best practices throughout implementation.
  - **How:** Added section 10 to `.github/copilot-instructions.md` covering: SOLID principles (SRP, OCP, LSP, ISP, DIP with explanations), code quality best practices (DRY, KISS, YAGNI, meaningful names, small functions, error handling, type safety, immutability, async/await, separation of concerns, dependency injection, configuration), code organization guidelines (module grouping, folder structure, file size limits), and documentation standards (self-documenting code, JSDoc for public APIs, keep comments current).

--
Keep entries short and focused. This doc is your presentation backbone.
