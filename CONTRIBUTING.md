Contributing & Copilot Guidelines
=================================

Purpose
-------
This project encourages collaborators to use GitHub Copilot to speed development, but every change must include a clear explanation of why and how. The files and CI in this repo guide contributors to leave traceable notes and ensure the `docs/` folder stays useful for presentations.

Before you code
- Open an issue describing the problem or feature.
- Link any relevant external references in the issue (docs, blog posts, repos).

When coding
- Use Copilot freely, but always review and edit generated code. Don't accept suggestions blindly.
- In your PR description, use the PR template fields: add "Why" and "How".
- If Copilot helped, add a short line: `Copilot: prompt -> "<prompt text>"`.

Commit & PR conventions
- Use the commit template (`.github/commit-template.txt`). Configure your git:

```powershell
git config commit.template .github/commit-template.txt
```

- Fill in the "Why" and "How" sections in commits and PR descriptions.

Documentation & changelog
- Update `docs/DesignWalkthrough.md` with a brief note about the change (1–3 lines) explaining the reasoning.
- The `docs/CHANGELOG.md` will be appended automatically by CI when PRs are merged; you may also update it manually for longer narrative entries.

CI & automation
- Merged PRs trigger a GitHub Action that appends the PR metadata to `docs/CHANGELOG.md` for audit and presentation. If your PR doesn't want to be logged (sensitive fixes), mark it as `no-changelog` in the PR body and get an approver to confirm.

Security
- Do not commit secrets or telemetry data. Use environment variables or a secrets manager.

Thanks — keep changes small and well-documented so we can present the evolution later.
