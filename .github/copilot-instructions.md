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

- `docs/CHANGELOG.md` — add a timestamped entry **at the top** (reverse chronological order - latest first):
  - Format: `- YYYY-MM-DD HH:MM — <what> — <why> (chat-driven)`
  - **CRITICAL**: New entries must be inserted at the TOP of the "Recent entries" section, immediately after the "---" line
  - The CHANGELOG maintains reverse chronological order so the most recent changes are always visible first

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

## Development Standards (you must follow these)

### 8. Always create tests
- **EVERY new module, feature, or function MUST have accompanying tests**
- Write tests for both MCP backend and VSCode extension
- Test files should be created in the same commit/change as the code they test
- Tests must be runnable via npm scripts (e.g., `npm test`)
- Test frameworks:
  - **MCP backend**: Use Jest or Mocha for unit tests
  - **VSCode extension**: Use VSCode's extension testing framework
- If you create code without tests, the user will ask you to add them

### 9. Maintain comprehensive documentation
You must maintain THREE levels of documentation:

**A. User Documentation (`docs/UserGuide.md`)**
- How to install the extension
- How to configure workspace settings
- How to authenticate (device code flow, client credentials)
- How to use the features (querying, saving queries, recommendations)
- Troubleshooting common issues
- Update this file whenever user-facing features change

**B. Component Changelogs**
- `packages/mcp/CHANGELOG.md` — Version history for MCP backend
- `packages/extension/CHANGELOG.md` — Version history for VSCode extension
- Use semantic versioning (MAJOR.MINOR.PATCH)
- Format: `## [version] - YYYY-MM-DD` with sections: Added, Changed, Fixed, Removed
- Update these files whenever you make changes to the respective component

**C. Developer Documentation (already exists)**
- `docs/DesignWalkthrough.md` — Design decisions and evolution
- `docs/CHANGELOG.md` — Overall project changes (chat-driven)
- `Instructions/Instructions.md` — Technical implementation reference

**When to update documentation:**
- Create UserGuide.md before scaffolding (with planned features)
- Create component CHANGELOGs with initial scaffolding
- Update UserGuide.md whenever user-facing behavior changes
- Update component CHANGELOGs with every feature/fix
- Keep all docs in sync with code changes

### 10. Follow SOLID principles and best practices
Apply these software engineering principles to all code:

**SOLID Principles:**
- **Single Responsibility Principle (SRP)**: Each class/module should have one reason to change. Keep functions focused on a single task.
- **Open/Closed Principle (OCP)**: Code should be open for extension but closed for modification. Use interfaces, abstract classes, and dependency injection.
- **Liskov Substitution Principle (LSP)**: Subtypes must be substitutable for their base types without breaking functionality.
- **Interface Segregation Principle (ISP)**: Clients shouldn't depend on interfaces they don't use. Create small, focused interfaces.
- **Dependency Inversion Principle (DIP)**: Depend on abstractions, not concrete implementations. Use dependency injection.

**Code Quality Best Practices:**
- **DRY (Don't Repeat Yourself)**: Extract common logic into reusable functions/modules
- **KISS (Keep It Simple, Stupid)**: Favor simple, readable solutions over clever complexity
- **YAGNI (You Aren't Gonna Need It)**: Don't add functionality until it's actually needed
- **Meaningful names**: Use descriptive variable, function, and class names that reveal intent
- **Small functions**: Keep functions short (< 20 lines ideally), doing one thing well
- **Error handling**: Always handle errors gracefully with proper logging and user feedback
- **Type safety**: Use TypeScript types and interfaces, avoid `any` unless absolutely necessary
- **Immutability**: Prefer `const` over `let`, avoid mutating objects when possible
- **Async/await**: Use modern async patterns, avoid callback hell
- **Separation of concerns**: Keep business logic separate from UI, data access, and infrastructure
- **Dependency injection**: Pass dependencies as parameters rather than hardcoding them
- **Configuration over hardcoding**: Use configuration files/environment variables for values that may change

**Code Organization:**
- Group related functionality into modules
- Use clear folder structure (e.g., `/models`, `/services`, `/utils`, `/tests`)
- Keep files focused and reasonably sized (< 300 lines)
- Export only what needs to be public

**Comments and Documentation:**
- Write self-documenting code with clear names
- Add comments only when code logic is complex or non-obvious
- Use JSDoc for public APIs and exported functions
- Keep comments up-to-date when code changes

### 11. Never execute git commands
**CRITICAL RULE**: You MUST NEVER execute git commands without EXPLICIT user request.

**Prohibited Commands (never run these):**
- `git add` / `git add -A` / `git add .`
- `git commit` / `git commit -m "..."`
- `git push` / `git push origin <branch>`
- `git pull` / `git fetch`
- `git merge` / `git rebase`
- `git checkout` / `git switch`
- `git tag` / `git branch`
- `git reset` / `git revert`
- Any other git command that affects repository history or remote state

**Acceptable Commands (these are fine):**
- Build tools: `npm run build`, `npm run compile`, `npm run lint`
- Test tools: `npm test`, `npm run test:watch`, `npm run coverage`
- File operations: creating, modifying, deleting files via tools
- Package managers: `npm install`, `npm ci` (when explicitly needed)
- Verification commands: checking file contents, running local servers

**Rationale:**
- User maintains full control over repository commits and pushes
- User needs to review changes before they become part of git history
- Automated commits bypass user's review and approval process
- Git operations have permanent effects on repository and remote

**Workflow Instead:**
1. Create/modify files as requested
2. Verify changes work locally (run build, tests)
3. Inform user: "Changes ready. Please review and commit when ready."
4. Let user decide when/how to commit and push

**Exception:**
- Only execute git commands if user explicitly says: "commit this", "push to GitHub", "git add these files", etc.
- Even then, confirm: "Should I run `git commit -m '...'`?"

**Example Violation:**
```
❌ BAD: run_in_terminal("git add -A && git commit -m 'fix' && git push")
```

**Example Correct Behavior:**
```
✅ GOOD: "I've fixed the CI errors by deleting the old test files. 
         Build succeeds and all 56 tests pass. 
         Changes are ready - please review and commit when you're satisfied."
```

---

## Notes for maintainers
- This file is read by GitHub Copilot at the start of each session.
- Keep it concise and actionable.
- Update this file if the logging format or workflow changes.
