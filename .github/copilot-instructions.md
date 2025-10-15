# GitHub Copilot Instructions for this Repository

## Purpose
This file provides persistent instructions to GitHub Copilot (the AI assistant) working in this repository. The goal is to capture the "why" and "how" behind every change so the project maintainer can later present the step-by-step evolution of this solution in a session.

## Rules for Copilot (you must follow these)

### 1. Always ask "why" if context is missing
- If the user requests a code change, file creation, or refactoring **without explaining the purpose**, ask: **"What's the purpose of this change? I'll log it to the docs."**
- Wait for the user to provide the reasoning before proceeding.

### 2. Log every significant action
After completing any significant change (new file, refactor, feature addition, config change), **you MUST append entries to ALL THREE files**:

- `docs/PromptLog.md` — **ALWAYS log the user's original prompt FIRST**:
  - Format: `### Entry #N — YYYY-MM-DD HH:MM`
  - Next line: `> "<user's prompt verbatim or paraphrased>"`
  - Increment entry number sequentially (check the file for the last entry number)
  - **Do this for EVERY user request that results in changes**, not just major features

- `docs/DesignWalkthrough.md` — add a short narrative entry (1-3 lines) in the "Stepwise implementation log" section with:
  - Date (YYYY-MM-DD)
  - What changed
  - Why it changed (user's stated purpose)
  - How it was implemented (brief technical note)
  - **Include reference to prompt**: `[Prompt #N]` at the end of the first line

- `docs/CHANGELOG.md` — add a timestamped entry:
  - Format: `- YYYY-MM-DD HH:MM — <what> — <why> (chat-driven)`

**CRITICAL**: Log the prompt to PromptLog.md BEFORE making changes, so you have the entry number to reference in DesignWalkthrough.md. **ALWAYS use exact timestamps (HH:MM format), NEVER use placeholders like "[Current Time]".**

### 3. What counts as "significant"
- New files or directories
- Changes to architecture, API contracts, or configuration
- Feature additions or removals
- Refactorings that affect multiple files
- Security or auth changes
- **ANY prompt from the user, even if it's just a question** — if the user asks something, log it to PromptLog.md

### 4. What doesn't need logging
- Typo fixes in comments (if explicitly requested by user)
- Formatting/linting changes (if explicitly requested by user)
- Minor doc clarifications (unless the user says to log it)

**IMPORTANT**: When in doubt, LOG IT. If the user asks a question or makes any request, log the prompt to PromptLog.md.

### 5. Format for log entries

**docs/DesignWalkthrough.md** (append under "Stepwise implementation log"):

```markdown
- **2025-10-15** — Added MCP JSON contract and workspace settings. [Prompt #3]
  - **Why:** Define a small, explicit data contract for agents to consume.
  - **How:** Created `Instructions.md` with endpoint specs, added example workspace `settings.json` keys.
```

**docs/CHANGELOG.md** (append at end):

```markdown
- 2025-10-15 14:32 — Added `.github/copilot-instructions.md` — Instructs Copilot to ask "why" and log every change to docs (chat-driven)
```

**docs/PromptLog.md** (append at end with sequential entry number):

```markdown
### Entry #3 — 2025-10-15 14:32
> "Add a cache.ts file for the MCP with file-based caching and TTL support."
```

### 6. Workflow summary
1. User makes ANY request or asks ANY question
2. **IMMEDIATELY log the prompt to `docs/PromptLog.md`** (to get entry number)
3. If no "why" provided for a change → ask for purpose
4. Make the change or answer the question
5. If significant change: Append log entries to `docs/DesignWalkthrough.md` (with `[Prompt #N]` reference) and `docs/CHANGELOG.md`
6. Confirm completion and show the log entry

**CRITICAL RULE**: EVERY user prompt gets logged to PromptLog.md FIRST, before doing anything else. Questions, changes, clarifications — EVERYTHING goes to PromptLog.md.

### 7. Example interaction

**User:** "Add a cache.ts file for the MCP."

**Copilot:** "What's the purpose of adding cache.ts? I'll log it to the docs."

**User:** "We need a simple file-based cache to store query results locally with TTL support."

**Copilot:** 
1. *(First, logs prompt to PromptLog.md as Entry #X)*
2. *(Creates cache.ts)*
3. *(Logs to DesignWalkthrough.md with [Prompt #X] reference)*
4. *(Logs to CHANGELOG.md)*
5. "Done. Added cache.ts with file-based caching and TTL. Logged to docs/PromptLog.md (#X), docs/DesignWalkthrough.md, and docs/CHANGELOG.md."

---

## Notes for maintainers
- This file is read by GitHub Copilot at the start of each session.
- Keep it concise and actionable.
- Update this file if the logging format or workflow changes.
