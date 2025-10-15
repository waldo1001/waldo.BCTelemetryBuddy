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

--
Keep entries short and focused. This doc is your presentation backbone.
