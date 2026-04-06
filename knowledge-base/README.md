# BC Telemetry Buddy — Knowledge Base

Community-maintained KQL patterns, event interpretations, investigation playbooks, and vendor-specific patterns for Microsoft Dynamics 365 Business Central telemetry analysis.

## Structure

```
knowledge-base/
├── query-patterns/       # Reusable KQL query templates
├── event-interpretations/ # What specific BC events mean and how to read them
├── playbooks/            # Step-by-step investigation workflows
└── vendor-patterns/      # Patterns specific to ISV extensions
```

## Article Format

Each article is a `.md` file with YAML frontmatter:

```yaml
---
title: "Your Article Title"
category: playbook          # query-pattern | event-interpretation | playbook | vendor-pattern
tags: [relevant, tags, here]
eventIds: [RT0006, RT0007]  # optional — related BC event IDs
appliesTo: "BC 24.0+"       # optional — BC version relevance
author: community
created: 2026-04-05
updated: 2026-04-05
---

Your markdown content here...
```

## How It Works

- Articles are **loaded at MCP startup** (fetched from GitHub, cached locally)
- Agents call `get_knowledge` to search for relevant patterns before writing KQL
- **Local KB** (your workspace) takes precedence over community articles
- Works offline — falls back to cached version if GitHub is unreachable

## Contributing

1. Create a `.md` file in the appropriate category folder
2. Include YAML frontmatter with at least `title`, `category`, and `tags`
3. Submit a pull request

The community benefits from your real-world telemetry investigation patterns!
