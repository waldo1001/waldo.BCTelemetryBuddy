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

**CRITICAL RULE**: EVERY user prompt gets logged to PromptLog.md, after doing everything else. Questions, changes, clarifications — EVERYTHING goes to PromptLog.md.
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

**AUTOMATED RELEASE PROCESS** - Use the release script for streamlined releases:

## Release Commands - User Triggers

When the user says phrases like:
- "Prepare a release" / "Release this" / "Let's release"
- "Publish a new version" / "Publish the MCP" / "Publish the extension"  
- "Bump version" / "New version"
- "Release extension" / "Release MCP"

**Your Response Protocol:**

### STEP 1: Determine Component and Bump Type

Ask clarifying questions if not specified:
1. **Which component?** extension or mcp (or both)
2. **Bump type?** patch (bug fixes), minor (new features), or major (breaking changes)

### STEP 2: Run Release Script with -NoCommit

**CRITICAL**: Run the release script with `-NoCommit` flag first to bump version and update CHANGELOG without pushing:

```powershell
# Run release script but don't commit/push yet
.\scripts\release.ps1 -BumpType patch -Component mcp -NoCommit
```

This will:
- Bump version in package.json
- Move [Unreleased] content to new version section in CHANGELOG.md
- **NOT** commit or push anything yet

### STEP 3: Review and Enhance CHANGELOG

After the script runs:
1. **Check the CHANGELOG**: Read the new version section that was just created
2. **Add missing details if needed**: If the [Unreleased] section was empty or incomplete, add release notes under the new version
3. **Show user the changes**: Display what version was bumped to and what's in the CHANGELOG
4. **Ask for confirmation**: "Ready to commit and push the release?"

### STEP 4: Commit and Push (ONLY after user confirmation)

Once user confirms, complete the release by committing and pushing:

```powershell
# Commit the version bump and CHANGELOG
git add packages/[component]/package.json packages/[component]/CHANGELOG.md packages/[component]/package-lock.json
git commit -m "chore: bump [component] version to X.Y.Z"

# Create and push tag
git tag [mcp-]vX.Y.Z
git push origin main --tags
```

This triggers the GitHub Actions workflow for build, test, and publish.

### STEP 5: What the Script Does Automatically

When run with -NoCommit:
1. ✅ Validates git status is clean
2. ✅ Checks current branch (warns if not main)
3. ✅ Bumps version in package.json
4. ✅ Updates CHANGELOG.md ([Unreleased] → [1.0.1] - YYYY-MM-DD)
5. ✅ Stops without committing (allows manual review/enhancement)

When completing the release (STEP 4):
6. ✅ Commits with message: "chore: bump [component] version to X.Y.Z"
7. ✅ Creates git tag (mcp-vX.Y.Z or vX.Y.Z)
8. ✅ Pushes commit and tag to GitHub
9. ✅ Triggers GitHub Actions (builds, tests, publishes)

### STEP 6: Monitor Release

After script completes, inform user:
```
🚀 Release initiated successfully!

📊 Monitor progress:
• GitHub Actions: https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions
• Release page: https://github.com/waldo1001/waldo.BCTelemetryBuddy/releases/tag/[TAG]

For Extension: https://marketplace.visualstudio.com/items?itemName=waldoBC.bc-telemetry-buddy
For MCP: https://www.npmjs.com/package/bc-telemetry-buddy-mcp
```

**CRITICAL RULES:**
1. **ALWAYS use -NoCommit first** - Run release script with -NoCommit to bump version and CHANGELOG
2. **Review CHANGELOG after bump** - Check what was moved from [Unreleased], add details if needed
3. **Wait for user confirmation** - User reviews before you commit/push
4. **Extension tags**: `v0.3.0` (no prefix)
5. **MCP tags**: `mcp-v1.0.1` (mcp- prefix)
6. **Cannot release both simultaneously** - Different tag formats required
7. **Script validates everything** - Clean git state, proper branch

**Script Parameters:**
- `-BumpType`: patch, minor, or major (REQUIRED)
- `-Component`: extension or mcp (default: extension)
- `-DryRun`: Preview changes without making them
- `-NoCommit`: Make changes but don't commit/push
- `-RunTests`: Run all tests before releasing

**Example Workflow:**

User: "Release the MCP"

You:
1. Ask: "What type of version bump? (patch/minor/major)"
2. User responds: "patch"
3. Run: `.\scripts\release.ps1 -BumpType patch -Component mcp -NoCommit`
4. Script bumps version (2.0.1 → 2.0.2) and updates CHANGELOG
5. Check CHANGELOG, add any missing details under [2.0.2] section if needed
6. Show user: "Bumped to v2.0.2. CHANGELOG shows: [list changes]. Ready to commit and push?"
7. Wait for user confirmation
8. Run git commands to commit, tag, and push
9. Inform user of monitoring links

**Error Handling:**
- Git not clean → Script stops, shows uncommitted files
- Tag exists → Script asks to delete/recreate
- Tests fail (if -RunTests) → Script stops before release
- Wrong branch → Script warns, asks to continue

---

## Notes for maintainers
- This file is read by GitHub Copilot at the start of each session.
- Keep it concise and actionable.
- Update this file if the logging format or workflow changes.
