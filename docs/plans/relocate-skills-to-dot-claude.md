---
topic: relocate-skills-to-dot-claude
status: done
created: 2026-05-08
---

## Task
Move the three project skills from `.github/skills/` to `.claude/skills/` so Claude Code auto-discovers them as invocable slash commands, and update all repo references to the new paths.

## Scope boundary
- IN:
  - Move `.github/skills/{tdd-workflow,security-scan,release}/` → `.claude/skills/{tdd-workflow,security-scan,release}/` (with `git mv` to preserve history)
  - Update markdown references in `CLAUDE.md`, `AGENTS.md`, `docs/tdd/methodology.md`, `.github/copilot-instructions.md`, and any docs that point at `.github/skills/...`
  - Fix the one broken intra-skill relative link (`tdd-workflow/SKILL.md` → `../../copilot-instructions.md` → must become `../../../.github/copilot-instructions.md`)
  - Leave a single stub `.github/skills/README.md` redirecting future readers to `.claude/skills/`
- OUT:
  - Editing skill *content* (no rewording of TDD phases, security-scan rules, or release flow)
  - Adding new skills, removing skills, or changing frontmatter beyond what's needed for discovery
  - Touching `docs/PromptLog.md` / `docs/DesignWalkthrough.md` (those are append-only logs, will be updated in Phase 9)

## Files to create / touch
**Move (preserve git history with `git mv`):**
- `.github/skills/tdd-workflow/SKILL.md` → `.claude/skills/tdd-workflow/SKILL.md`
- `.github/skills/security-scan/SKILL.md` → `.claude/skills/security-scan/SKILL.md`
- `.github/skills/security-scan/allowlist.txt` → `.claude/skills/security-scan/allowlist.txt`
- `.github/skills/release/SKILL.md` → `.claude/skills/release/SKILL.md`

**Create:**
- `.github/skills/README.md` — short stub: "Skills moved to `.claude/skills/` so Claude Code auto-discovers them. See `/.claude/skills/<name>/SKILL.md`."

**Edit (path updates only):**
- `CLAUDE.md` — 2 references (lines 32, 37)
- `AGENTS.md` — 4 references (lines 27, 33, 36–38)
- `docs/tdd/methodology.md` — 3 references (lines 12, 21, 213)
- `.github/copilot-instructions.md` — 4 references (lines 545–547, 568)
- `.claude/skills/tdd-workflow/SKILL.md` — fix `../../copilot-instructions.md` to `../../../.github/copilot-instructions.md`
- `.claude/skills/security-scan/SKILL.md` — verify `../../../docs/tdd/methodology.md` and `../release/SKILL.md` still resolve (they do — same depth)

**Do NOT edit:**
- `docs/plans/done/agent-toolchain-upgrade.md` — historical plan; its references describe state at time of writing. Leave as-is.
- `docs/DesignWalkthrough.md` — historical entries; same reasoning.

## Interface
N/A — no code, no schemas. Markdown link updates only.

The Claude Code skill-discovery contract being satisfied:
- Skill file path: `.claude/skills/<name>/SKILL.md`
- Frontmatter (already present in all three): `name:`, `description:` (and optionally `user_invocable:`, `arguments:`)
- Result: `/tdd-workflow`, `/security-scan`, `/release` become invocable slash commands.

## Dependencies
- No code dependencies.
- Documentation cross-link integrity (verified by grep before/after).

## RED test list
N/A — this is a documentation/file-relocation change with no testable code surface. Verification is link-resolution by `grep` and a manual `ls` check that the three `SKILL.md` files exist at the new paths.

Manual verification gate (in lieu of automated tests):
- `grep -rn "\.github/skills" --include="*.md"` returns only: (a) the new stub `.github/skills/README.md`, (b) historical files in `docs/plans/done/` and `docs/DesignWalkthrough.md`, (c) nothing else.
- All `[text](path)` links in the four edited docs resolve to existing files.
- `ls .claude/skills/tdd-workflow/SKILL.md .claude/skills/security-scan/SKILL.md .claude/skills/security-scan/allowlist.txt .claude/skills/release/SKILL.md` all succeed.

## Telemetry (Rule 13)
N/A — no new feature, no new tool, no new code path. Rule 13 applies to features and tools; this is repository housekeeping.

## Open questions / assumptions
- **Assumption:** No external CI workflow, GitHub Action, or tool reads from `.github/skills/`. Verified: `grep -rn "\.github/skills" .github/workflows` returns no hits (will re-confirm before executing).
- **Assumption:** `git mv` will preserve history cleanly (Git tracks renames by content similarity; `SKILL.md` files are 100% unchanged so this is reliable).
- **Q:** Should `.github/skills/` be deleted entirely, or kept with a `README.md` stub? → Plan says **keep with stub**, because `AGENTS.md` and `.github/copilot-instructions.md` are the conventional locations for Copilot/other-agent guidance and someone reading `.github/` may still look for skills there. A stub costs nothing and prevents confusion.

## Risks
- **Broken internal links** if a path update is missed. Mitigation: grep audit before and after, listed above.
- **GitHub Copilot Chat / other agents may have hardcoded `.github/skills/` paths.** Mitigation: the stub `README.md` redirects them; AGENTS.md (which Copilot reads) gets updated to the new path.
- **Symlink-style "both locations work" was rejected** in the prior chat round in favor of a single source of truth, so there's no Windows-symlink risk.
- **Plan file in `docs/plans/done/agent-toolchain-upgrade.md` references old paths** — intentionally not edited (historical record). A future reader following those links will find the stub README and be redirected. Acceptable.

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - No code, no API, no tool schema, no on-disk format change. Pure file move + markdown link updates.
  - The behaviour change *users* see is **additive**: three new slash commands appear in Claude Code. Nothing previously working stops working.
  - Existing references in *historical* docs (`docs/plans/done/`, `docs/DesignWalkthrough.md`) are intentionally not rewritten; the stub `README.md` keeps those links from 404-ing for a human reader.
- **Who/what could break:**
  - Any external script or CI step that `cat`s `.github/skills/<name>/SKILL.md` directly — none found in this repo, but cannot rule out a personal script outside the repo. Detection: user reports a broken local script.
  - GitHub Copilot Chat if it has cached/hardcoded the old path. Detection: Copilot fails to load the skill; user notices in their next Copilot session.
- **Detection:**
  - Slash commands `/tdd-workflow`, `/security-scan`, `/release` appear in Claude Code's skill list (positive signal of success).
  - `grep -rn "\.github/skills/[a-z]" --include="*.md" --exclude-dir=done --exclude=DesignWalkthrough.md` returns zero hits after the change.
  - Markdown link checker (manual or `markdown-link-check` if installed) on the four edited files reports no broken links.

No version bump required — this does not affect the published extension or MCP server. CHANGELOG is *not* updated (Rule for CHANGELOG entries: user-visible product changes only; internal repo housekeeping doesn't qualify).

## Out-of-scope follow-ups
- Once the move is verified working, consider whether the stub `.github/skills/README.md` can be deleted in a future cleanup (after a grace period of ~1 release cycle to let any cached Copilot references clear).
- If we later add Claude Code plugins, evaluate whether these skills should move into a plugin instead of `.claude/skills/`.
