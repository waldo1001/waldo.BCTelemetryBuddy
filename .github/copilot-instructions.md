# GitHub Copilot Instructions for this Repository

## Purpose
This file provides persistent instructions to GitHub Copilot (the AI assistant) working in this repository. The goal is to capture the "why" and "how" behind every change so the project maintainer can later present the step-by-step evolution of this solution in a session.

## Rules for Copilot (you must follow these)

### 0. Never ask for confirmation — just do it
- When the user asks you to do something, **DO IT**. Do not ask "Ready to proceed?", "Should I commit?", or "Want me to continue?".
- This applies to ALL actions: code changes, releases, git operations, file creation, etc.
- If the user says "release", bump the version, update docs, commit, tag, and push — all in one go.
- The only exception is Rule #1 below: if the user's *purpose* is unclear, ask for the "why" so it can be logged.

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

**Testing with MCP Inspector:**
When testing the MCP server without Claude Desktop or VSCode, use the MCP Inspector with manual environment variable configuration:

1. **Install**: `npm install -g @modelcontextprotocol/inspector`
2. **Set Environment Variables Manually** - The inspector doesn't reliably pass custom env vars through its UI. Provide these values in the inspector's environment configuration:
   - **Required**:
     - `BCTB_WORKSPACE_PATH` - Full path to workspace (e.g., `C:\Temp\BCTelemetryBuddy.test`)
     - `BCTB_TENANT_ID` - Azure tenant ID
     - `BCTB_APP_INSIGHTS_ID` - Application Insights App ID
     - `BCTB_AUTH_FLOW` - `azure_cli` (recommended for testing)
     - `BCTB_KUSTO_CLUSTER_URL` - Kusto cluster URL (required even though code ignores it for validation)
   - **Optional**:
     - `BCTB_CACHE_ENABLED` - `true`/`false`
     - `BCTB_CACHE_TTL_SECONDS` - Cache TTL in seconds (default: `3600`)
     - `BCTB_QUERIES_FOLDER` - Queries subfolder name (default: `queries`)
3. **Authenticate First**: Run `az login --tenant <tenant-id>` before starting inspector
4. **Ensure Workspace Exists**: Create the workspace path and queries folder before testing
5. **Known Issues**:
   - ❌ Config file discovery doesn't work reliably in inspector - use environment variables
   - ❌ Environment variables set in shell may not be passed to spawned MCP process
   - ✅ Manual entry in inspector UI is most reliable method

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

### 13. Always add telemetry for new features and tools

**Every new MCP tool and every new extension feature/command MUST include telemetry.** No exceptions. If you add code without telemetry, the implementation is incomplete.

#### MCP Tools

When adding a new MCP tool (e.g., `get_knowledge`, `save_knowledge`):

1. **Add a dedicated event ID** to `TELEMETRY_EVENTS.MCP_TOOLS` in `packages/shared/src/telemetryEvents.ts`:
   ```typescript
   GET_KNOWLEDGE: 'TB-MCP-111',
   SAVE_KNOWLEDGE: 'TB-MCP-112',
   ```
   - Use sequential IDs (`TB-MCP-1xx` for tools)
   - Name matches the tool name in SCREAMING_SNAKE_CASE

2. **The generic completion event** already fires for all tools at the end of `toolHandlers.ts` (`Mcp.ToolCompleted` with `toolName` property). That is the minimum — it covers all tools automatically.

3. **For tools that have meaningful outcomes**, add a tool-specific `trackEvent` call inside the handler case (before `result` is set) using the dedicated event ID:
   ```typescript
   case 'save_knowledge': {
       // ... implementation ...
       this.services.usageTelemetry.trackEvent(
           'Mcp.SaveKnowledge',
           cleanTelemetryProperties(createCommonProperties(
               TELEMETRY_EVENTS.MCP_TOOLS.SAVE_KNOWLEDGE, 'mcp',
               this.services.sessionId, this.services.installationId, VERSION,
               { target: params.target, toolName: 'save_knowledge' }
           ))
       );
   }
   ```

#### Extension Features

When adding a new extension service, command, or webview provider:

1. **Use `trackOperationWithTelemetry`** from `packages/extension/src/services/extensionTelemetry.ts` to wrap operations that can succeed or fail:
   ```typescript
   import { trackOperationWithTelemetry } from '../services/extensionTelemetry.js';

   await trackOperationWithTelemetry(
       usageTelemetry,
       'KnowledgeBase.SaveArticle',
       { category: params.category },
       async () => { /* ... */ }
   );
   ```

2. **For simpler events**, call `usageTelemetry.trackEvent` directly with a descriptive name:
   ```typescript
   usageTelemetry.trackEvent('KnowledgeBase.Opened', { source: 'commandPalette' });
   ```

3. **Add event ID constants** to `TELEMETRY_EVENTS.EXTENSION` in `telemetryEvents.ts` if the event is significant (user actions, errors, lifecycle events).

#### Telemetry Checklist (applies to EVERY feature)

- [ ] Event ID added to `packages/shared/src/telemetryEvents.ts` (if significant)
- [ ] `trackEvent` or `trackOperationWithTelemetry` called in the handler/service
- [ ] Tests verify telemetry is called with correct event name and properties (mock `usageTelemetry.trackEvent`)
- [ ] No sensitive data (tokens, tenant IDs, user content) in telemetry properties

**Why this rule exists:** Telemetry was omitted from `get_knowledge`, `save_knowledge` (MCP) and `KnowledgeBaseProvider` (extension) because there was no explicit instruction requiring it. This rule closes that gap permanently.

---

### 12. Release workflow automation

**AUTOMATED RELEASE PROCESS** - Use the release script for streamlined releases:

## Release Commands - User Triggers

When the user says phrases like:
- "Prepare a release" / "Release this" / "Let's release"
- "Publish a new version" / "Publish the MCP" / "Publish the extension"  
- "Bump version" / "New version"
- "Release extension" / "Release MCP"

**Your Response Protocol:**

### STEP 1: Check for Unreleased Commits

**CRITICAL**: Before asking the user anything, ALWAYS check both components for unreleased commits:

```powershell
# Check git log for commits since last release tag
git log --oneline mcp-v$(jq -r .version packages/mcp/package.json)..HEAD -- packages/mcp/
git log --oneline v$(jq -r .version packages/extension/package.json)..HEAD -- packages/extension/
```

**If ANY commits exist that are not released yet:**
- Those commits MUST be included in the release
- Inform the user: "Found unreleased commits in [component]. These will be included in the release."

### STEP 2: Determine Component and Bump Type

Ask clarifying questions if not specified:
1. **Which component?** extension or mcp (or both)
2. **Bump type?** patch (bug fixes), minor (new features), or major (breaking changes)

**IMPORTANT**: If user says "release" without specifying component, check BOTH components for unreleased commits and release whichever has unreleased changes.

### STEP 3: Bump Versions and Update CHANGELOGs

**CRITICAL**: First, manually bump the version in package.json and update CHANGELOG.md for the component(s):

```powershell
# For each component being released:
# 1. Read current version from packages/[component]/package.json
# 2. Calculate new version (patch: X.Y.Z+1, minor: X.Y+1.0, major: X+1.0.0)
# 3. Update version field in package.json
# 4. Update CHANGELOG.md: Add new [X.Y.Z] - YYYY-MM-DD section with release notes
# 5. Update ReleaseNotesProvider.ts content if MAJOR version (extension only)
```

**What to change:**
- `packages/[component]/package.json`: Bump the `version` field
- `packages/[component]/CHANGELOG.md`: Add `## [X.Y.Z] - 2025-MM-DD` section with release notes
- `packages/extension/src/webviews/ReleaseNotesProvider.ts`: Update HTML content (MAJOR releases only)

**Release Notes Behavior (Extension Only):**
- Release notes page automatically shows ONLY on MAJOR version updates (e.g., 1.x.x → 2.0.0)
- Patch and minor updates do NOT trigger the release notes page
- Update `ReleaseNotesProvider.ts` content when doing MAJOR releases to reflect new features

### STEP 4: Commit and Push

After making the version and CHANGELOG changes, immediately commit and push:

```powershell
# Commit the version bump and CHANGELOG
git add packages/[component]/package.json packages/[component]/CHANGELOG.md packages/[component]/package-lock.json
git commit -m "chore: bump [component] version to X.Y.Z"

# Create and push tag
git tag [mcp-]vX.Y.Z
git push origin main --tags
```

This triggers the GitHub Actions workflow for build, test, and publish.

### STEP 5: What Happens Next

After pushing:
1. ✅ GitHub Actions workflows are triggered automatically
2. ✅ Builds run for the component(s)
3. ✅ Tests execute to validate the release
4. ✅ Packages are published (Extension to VS Code Marketplace, MCP to NPM)

### STEP 6: Monitor Release

After pushing, inform user:
```
🚀 Release initiated successfully!

📊 Monitor progress:
• GitHub Actions: https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions
• Release page: https://github.com/waldo1001/waldo.BCTelemetryBuddy/releases/tag/[TAG]

For Extension: https://marketplace.visualstudio.com/items?itemName=waldoBC.bc-telemetry-buddy
For MCP: https://www.npmjs.com/package/bc-telemetry-buddy-mcp
```

**CRITICAL RULES:**
1. **ALWAYS check for unreleased commits FIRST** - Check git log for both components before asking user anything
2. **ALWAYS bump versions manually FIRST** - Edit package.json and CHANGELOG.md before any git operations
3. **Update ReleaseNotesProvider.ts for MAJOR extension releases** - Content must match new version features
4. **Extension tags**: `v0.3.0` (no prefix)
6. **MCP tags**: `mcp-v1.0.1` (mcp- prefix)
7. **Cannot release both simultaneously** - Different tag formats required
8. **Use semantic versioning** - patch (X.Y.Z+1), minor (X.Y+1.0), major (X+1.0.0)
9. **Release notes auto-show on MAJOR only** - Extension shows release notes page only when X changes in X.Y.Z

**Script Parameters:**
- `-BumpType`: patch, minor, or major (REQUIRED)
- `-Component`: extension or mcp (default: extension)
- `-DryRun`: Preview changes without making them
- `-NoCommit`: Make changes but don't commit/push (DEPRECATED - manual process preferred)
- `-RunTests`: Run all tests before releasing

**Example Workflow:**

User: "Release the MCP"

You:
1. Ask: "What type of version bump? (patch/minor/major)"
2. User responds: "patch"
3. Read current version from packages/mcp/package.json (e.g., 2.0.1)
4. Calculate new version (2.0.2)
5. Update packages/mcp/package.json: `"version": "2.0.2"`
6. Update packages/mcp/CHANGELOG.md: Add `## [2.0.2] - 2025-11-18` section with release notes
7. Commit, tag `mcp-v2.0.2`, and push
8. Inform user of monitoring links

**Error Handling:**
- Git not clean → Show uncommitted files, ask user to commit or stash first
- Tag exists → Ask if user wants to delete and recreate
- Wrong branch → Warn user, ask to continue or switch to main
- Manual version conflicts → Check package.json and CHANGELOG match before proceeding

---

## Mandatory Skills (all AI agents)

**BEFORE making any code change**, load and follow the TDD skill:

```
.github/skills/tdd-workflow/SKILL.md
```

This file contains the full TDD methodology, mocking patterns, coverage thresholds, and development checklists for this project. It is mandatory — not optional.

Also use any other skills under `.github/skills/` that match the type of work being done.

---

## Default TDD Workflow — Apply to ALL code changes in this repo

Every code change follows a strict 6-phase cycle. This is not an opt-in mode — it is the default way we work.

### Phase 1 — DESIGN (present to user, wait for approval)
```
DESIGN: <feature name>

WHAT: <one-line description>
WHY: <user need>
WHERE: <packages and files affected>

INTERFACE:
  - <function/class signatures>
  - <tool schema if MCP tool>

TEST STRATEGY:
  - <what to test>
  - <what to mock>
  - <edge cases>

Approve this design? (I'll write tests next)
```

### Phase 2 — WRITE TESTS
- Create test files in the appropriate `__tests__/` directory
- Follow the mocking patterns from `.github/skills/tdd-workflow/SKILL.md`
- Cover happy path, error paths, and edge cases
- Use `describe`/`it` blocks matching the interface from Phase 1

### Phase 3 — VERIFY TESTS FAIL
- Run: `cd packages/<pkg> && npx jest --no-coverage <test-file>`
- If tests fail for the **right reason** (missing impl) → proceed
- If tests fail for the **wrong reason** (import error, syntax) → fix the test
- If scaffolding needed (empty stubs) → create minimal stubs so tests compile

### Phase 4 — IMPLEMENT
- Write the minimum code to make tests pass
- SOLID principles, dependency injection, functions < 20 lines

### Phase 5 — VERIFY TESTS PASS
- Run: `cd packages/<pkg> && npm run test:coverage`
- ALL tests must pass; coverage must meet thresholds (70% statements/lines, 60% branches)
- If tests fail → fix implementation, NOT tests
- Run `npm run build` from root to verify compilation

### Phase 6 — DOCUMENT
- Append to `docs/PromptLog.md` and `docs/DesignWalkthrough.md` (per Rule 2 above)
- Update component `CHANGELOG.md` if needed
- Update `docs/UserGuide.md` if user-facing behavior changed
- Tell user: "Changes ready — please review and commit when ready."

### TDD Behavioral Rules

1. **NEVER write implementation code first** — always tests first
2. **NEVER skip the design phase** — present a plan before writing any code
3. **NEVER mark something as done without running tests**
4. **ALWAYS use `manage_todo_list`** with the 6 phases as todo items
5. **Run tests in terminal** — never assume tests pass without running them
6. **Show test output** to the user at each verify step
7. **If a test reveals a bug** in existing code, fix the bug (not the test)
8. **Keep functions small** — extract helpers when a function exceeds 20 lines

---

## Project Architecture Reference

```
packages/
  shared/      Core services (auth, kusto, cache, queries, sanitize, eventLookup)
               Consumed by MCP and extension via @bctb/shared
  mcp/         MCP server (stdio transport + HTTP)
               tools/toolDefinitions.ts — tool schemas
               tools/toolHandlers.ts   — business logic
  extension/   VSCode extension
               services/   — telemetryService, migrationService, etc.
               webviews/   — SetupWizard, ProfileWizard, etc.
```

**Test file locations:**
```
packages/shared/src/__tests__/
packages/mcp/src/__tests__/
packages/extension/src/__tests__/
```

**Test commands:**
```bash
npm test                           # All packages
cd packages/mcp && npm test        # MCP only
cd packages/extension && npm test  # Extension only
cd packages/shared && npm test     # Shared only
```

**What NOT to test** (no test host available):
- VSCode UI components requiring a full extension host (`extension.ts`, `SetupWizardProvider.ts`)
- Pure data files (`agentDefinitions.ts`)
- Auto-generated files (`version.ts`, `telemetryConfig.generated.ts`)
- CLI entry points (`cli.ts`, `server.ts`)

---

## Notes for maintainers
- This file is read by GitHub Copilot at the start of each session and is the **single source of truth** for all AI agents working in this repo (Copilot, Claude Code, etc.).
- `AGENTS.md` (root) and `CLAUDE.md` (root) both delegate to this file.
- Keep it concise and actionable.
- Update this file if the logging format, workflow, or TDD rules change.
