# GitHub Copilot Instructions for this Repository

## Purpose
This file provides persistent instructions to GitHub Copilot (the AI assistant) working in this repository. The goal is to capture the "why" and "how" behind every change so the project maintainer can later present the step-by-step evolution of this solution in a session.

## Rules for Copilot (you must follow these)

### 1. Always ask "why" if context is missing
- If the user requests a code change, file creation, or refactoring **without explaining the purpose**, ask: **"What's the purpose of this change? I'll log it to the docs."**
- Wait for the user to provide the reasoning before proceeding.

### 2. Log every action
For every user prompt or request, you MUST append entries to both `docs/PromptLog.md` and `docs/DesignWalkthrough.md`. Do NOT update `docs/CHANGELOG.md` for every prompt — update `docs/CHANGELOG.md` only for releases, major API/architecture changes, or when the user explicitly requests a changelog entry.

- `docs/PromptLog.md` — **ALWAYS log the user's original prompt FIRST**:
   - Format: `### Entry ID: <guid> — YYYY-MM-DD HH:MM`
   - Next line: `> "<user's prompt verbatim or paraphrased>"`
   - Use GUID-based EntryId (generate with `[guid]::NewGuid().ToString()`)
   - **Do this for EVERY user request**, even questions or small edits — PromptLog.md is the authoritative chronological record.

- `docs/DesignWalkthrough.md` — **ALWAYS append a short narrative entry** (1-3 lines) in the "Stepwise implementation log" section for every prompt or change, using the blind-append template below. Include the entry reference `[Entry: <guid>]` so entries can be cross-referenced to the PromptLog.
   - What to include: Date (YYYY-MM-DD), short title, one-line Why, one-line How

- `docs/CHANGELOG.md` — update this file ONLY for releases, major changes, or when the user explicitly requests a CHANGELOG entry:
    - Format: `- YYYY-MM-DD HH:MM — <what> — <why> (chat-driven)`
    - **When to update:** releases (version bumps), large API/architecture changes, or when the user asks. Do NOT update this file for every prompt or small tweak.
    - **How to update when required:** read only the first 30 lines to find the "Recent entries" section and insert the new entry directly after it (reverse chronological order).
    - Rationale: `docs/CHANGELOG.md` is a project-level, release-focused log and updating it for every prompt creates noise and slows iteration.

**CRITICAL**: Log the prompt to PromptLog.md BEFORE making changes, so you have the EntryId (GUID) to reference in DesignWalkthrough.md. **ALWAYS use exact timestamps (HH:MM format), NEVER use placeholders like "[Current Time]". ALWAYS generate a new GUID for each entry.**

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
- **2025-10-15** — Added MCP JSON contract and workspace settings. [Entry: a1b2c3d4-e5f6-7890-abcd-ef1234567890]
  - **Why:** Define a small, explicit data contract for agents to consume.
  - **How:** Created `Instructions.md` with endpoint specs, added example workspace `settings.json` keys.
```

**docs/CHANGELOG.md** (append at end):

```markdown
- 2025-10-15 14:32 — Added `.github/copilot-instructions.md` — Instructs Copilot to ask "why" and log every change to docs (chat-driven)
```

**docs/PromptLog.md** (append at end with GUID-based EntryId):

```markdown
### Entry ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890 — 2025-10-15 14:32
> "Add a cache.ts file for the MCP with file-based caching and TTL support."
```

### 6. Workflow summary
1. User makes ANY request or asks ANY question
2. **AT THE END OF THE PROCESS - log the prompt to `docs/PromptLog.md`** using FAST APPEND (read last 20 lines only to get next entry number). This gives you the `[Prompt #N]` to reference.
3. If no "why" provided for a change → ask for purpose
4. Make the change or answer the question
5. **AT THE END OF THE PROCESS - Always append to `docs/DesignWalkthrough.md`** by blindly appending the exact template below. DO NOT read, parse, search, or attempt to merge against `DesignWalkthrough.md` — always append to the end. Use the `[Prompt #N]` from PromptLog.md in the entry.
   - Template to append (exact structure):
      - `- **YYYY-MM-DD** — <Short title> [Prompt #N]`
         - `  - **Why:** <one-line reason>`
         - `  - **How:** <one-line implementation note>`
   - Keep entries short (1–3 lines plus Why/How lines). The maintainer can expand later if needed.
6. Update `docs/CHANGELOG.md` only when it's a release/major change or the user explicitly asks for a changelog entry. When updating, do a targeted read of the first 30 lines to find the insertion point and prepend the new entry there.
7. Confirm completion and show the log entry

**CRITICAL RULE**: EVERY user prompt gets logged to PromptLog.md FIRST, after doing everything else. Questions, changes, clarifications — EVERYTHING goes to PromptLog.md.
**CRITICAL RULE**: EVERY log entry must include a timestamp and a unique entry ID.
**CRITICAL RULE**: Use FAST APPEND strategy to avoid reading files unnecessarily.
**FAST LOGGING STRATEGY** (fast, reliable, no reading):
**CRITICAL: Use PowerShell `Add-Content` for ALL log appends - NEVER read the files:**
**CRITICAL RULE**: execute the entire prompt first, then log to PromptLog and DesignWalkthrough at the end.

**PromptLog.md**: 
```powershell
# Generate GUID-based EntryId (NO reading files, NO counting, NO conflicts)
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$entryId = [guid]::NewGuid().ToString()

# Append new entry (NEVER read any file)
$entry = "`n### Entry ID: $entryId — $timestamp`n> `"$userPrompt`"`n`n---"
Add-Content -Path "docs/PromptLog.md" -Value $entry -NoNewline
```

**DesignWalkthrough.md**:
```powershell
# Append new entry (NEVER read file, NEVER parse, NEVER search)
# Reference the GUID from PromptLog instead of entry number
$date = Get-Date -Format "yyyy-MM-dd"
$entry = "`n- **$date** — $shortTitle [Entry: $entryId]`n  - **Why:** $reason`n  - **How:** $implementation"
Add-Content -Path "docs/DesignWalkthrough.md" -Value $entry -NoNewline
```

**CHANGELOG.md** (only for releases/major changes):
```powershell
# Read ONLY first 30 lines to find insertion point
$lines = Get-Content "docs/CHANGELOG.md" -Head 30
# Find "Recent entries" line, insert after it
# (Only when explicitly needed for releases)
```

**Why PowerShell `Add-Content` is best:**
- ✅ **NEVER reads any files** - generates GUID, appends to end
- ✅ **Zero file I/O overhead** - no need to read last line for entry number
- ✅ **Atomic operation** - no merge conflicts from concurrent prompts
- ✅ **Fast** - instant append regardless of file size
- ✅ **Reliable** - Windows native, works every time
- ✅ **Simple** - two commands (generate GUID, append), no parsing logic

**ABSOLUTE RULES:**
1. **NEVER use `read_file` on PromptLog.md or DesignWalkthrough.md**
2. **NEVER read last line to get entry number** - use GUID instead
3. **ALWAYS use PowerShell `Add-Content` to append**
4. **ALWAYS generate new GUID for each entry** - use `[guid]::NewGuid().ToString()`
5. **Changes appear immediately in VSCode** - user can see diffs

**Example workflow:**
```
1. Generate GUID for PromptLog entry:
   - run_in_terminal: $entryId = [guid]::NewGuid().ToString()

2. Append to PromptLog.md:
   - run_in_terminal: Add-Content with "Entry ID: $entryId" (includes user prompt verbatim)

3. Append to DesignWalkthrough.md:
   - run_in_terminal: Add-Content with Why/How template [Entry: $entryId]

4. DONE - both files updated, ZERO file reading
```

**Key principle:** APPEND ONLY, NEVER READ. Use GUID-based EntryId to eliminate all file I/O overhead.

### 7. Example interaction

**User:** "Add a cache.ts file for the MCP."

**Copilot:** "What's the purpose of adding cache.ts? I'll log it to the docs."

**User:** "We need a simple file-based cache to store query results locally with TTL support."

**Copilot:** 
1. *(First, logs prompt to PromptLog.md as Entry #X using fast append)*
2. *(Creates cache.ts)*
3. *(Logs to DesignWalkthrough.md with [Prompt #X] reference using fast append)*
4. *(Logs to CHANGELOG.md using light prepend)*
5. "Done. Added cache.ts with file-based caching and TTL. Logged to docs (Entry #X)."

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

### 12. Release workflow automation
**Conversational Release Triggers**: When the user says phrases like:
- "Release this version" / "Release this"
- "Publish a new version" / "Publish this"
- "Let's ship this" / "Ship it"
- "I want to release" / "Time to release"
- "Create a release" / "Make a release"

**Your Response Protocol:**

**Step 1: Gather Context** - Check current state:
```
1. Read current version from packages/extension/package.json
2. Run git status to check working directory is clean
3. Check current branch (should be main)
4. Optionally run git log to see recent changes
```

**Step 2: Present Pre-flight Check** with this format:
```
Ready to release BC Telemetry Buddy!

📋 Pre-flight check:
✅ Current version: 0.2.3
✅ Git working directory clean
✅ On main branch
✅ Last commit: [brief description]

📦 What I'll do:
1. Update component CHANGELOG(s) with version changes
2. Run all tests (311 tests)
3. Bump version: 0.2.3 → 0.2.4 (example)
4. Commit: "chore: bump extension version to 0.2.4" (includes CHANGELOG updates)
5. Create git tag: v0.2.4
6. Push to GitHub (triggers CI/CD pipeline)
7. Monitor deployment to VS Code Marketplace

Which version bump would you like?
• patch (0.2.3 → 0.2.4) - Bug fixes, small improvements
• minor (0.2.3 → 0.3.0) - New features, backward compatible
• major (0.2.3 → 1.0.0) - Breaking changes

Type: patch, minor, or major (or 'cancel' to abort)
```

**Step 3: Update Component CHANGELOGs** - Before running release script:
```
1. Determine which component(s) are being released (extension, mcp, or both)
2. For each component, update its CHANGELOG.md:
   - packages/extension/CHANGELOG.md for extension releases
   - packages/mcp/CHANGELOG.md for MCP releases
3. Add new version section at the top with format:
   ## [X.Y.Z] - YYYY-MM-DD
   
   ### Added
   - [List new features]
   
   ### Changed
   - [List changes to existing functionality]
   
   ### Fixed
   - [List bug fixes]
   
   ### Removed
   - [List removed features]
4. Move relevant items from [Unreleased] section to new version section
5. Keep [Unreleased] section at top for future changes
6. Save the file(s) - they will be committed with version bump
```

**Step 4: Execute Release** after CHANGELOGs updated and user confirms bump type:
```
1. Run: .\scripts\release.ps1 -BumpType [user's choice]
2. Script will automatically include CHANGELOG.md in the commit (uses 'git add -A')
3. Monitor terminal output for errors
4. If successful, show success message with links
5. If errors occur, diagnose and report
```

**Step 5: Confirm Success** with this format:
```
🚀 Release v0.2.4 initiated successfully!

✅ Version bumped and committed
✅ Tag v0.2.4 created and pushed
✅ GitHub Actions triggered

📊 Monitor progress:
• GitHub Actions: https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions
• Release page: https://github.com/waldo1001/waldo.BCTelemetryBuddy/releases/tag/v0.2.4
• Marketplace: https://marketplace.visualstudio.com/items?itemName=waldoBC.bc-telemetry-buddy

The extension will be live on the marketplace in ~5-10 minutes after CI completes.
```

**Error Handling:**
- **Tests fail** → Report which tests failed, show output, suggest fixes, DO NOT proceed
- **Git not clean** → Show `git status` output, ask user to commit/stash, DO NOT proceed
- **Not on main** → Warn user, ask if they want to continue anyway
- **Tag already exists** → Script handles this (prompts to delete/recreate)
- **Script fails** → Show error output, diagnose issue, suggest manual steps if needed

**Special Cases:**
- If user says "release both" or "release extension and mcp" → use `-Component both`
- If user says "dry run first" → run with `-DryRun` flag first, then ask to proceed
- If user wants to review before pushing → use `-NoCommit` flag

**CRITICAL RULES:**
1. **NEVER auto-release without user confirmation** - Always present pre-flight check and wait for bump type
2. **NEVER skip tests** - Tests must pass before releasing (unless user explicitly overrides with -DryRun)
3. **Follow Rule #11** - Use `.\scripts\release.ps1` script, don't run git commands directly
4. **Log the interaction** - Log the "release this version" prompt to PromptLog.md as usual

**Example Interaction:**

User: "Release this version"

You: [Present pre-flight check with current state and ask for bump type]

User: "patch"

You: [Run .\scripts\release.ps1 -BumpType patch, monitor output, show success message with links]

---

## Notes for maintainers
- This file is read by GitHub Copilot at the start of each session.
- Keep it concise and actionable.
- Update this file if the logging format or workflow changes.
