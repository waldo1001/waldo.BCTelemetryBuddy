# Prompt Log — User Requests

This file logs every user prompt that resulted in a significant change to the codebase. It serves as metadata for understanding the conversational flow and how to replicate the development process.

Each entry is numbered sequentially and referenced from `docs/DesignWalkthrough.md` using the format `[Prompt #N]`.

---

### Entry #1 — 2025-10-15 14:45
> "create github-copilot instructions to make sure that every change is monitored to why and how...logs this to the necessary documentation file(s)"

---

### Entry #2 — 2025-10-15 14:50
> "Add to the copilot instructions to also document/log my prompts...it's good metadata that will show me how to get to stuff. If you want, you can log the prompts in a separate file, and reference to it from the #file:DesignWalkthrough.md"

---

### Entry #3 — 2025-10-15 15:10
> "I want to be able to simply save .kql files in a workspace, and that the MCP will pick up these queries as context for resolving KQL. Remember I should have the option to 'save a query', in that case, the query should be saved as a readable .kql file in my workspace, with explanation on top of the query to have enough context about it for future reference."

---

### Entry #4 — 2025-10-15 15:20
> "I see you're not saving all my prompts. Update #file:copilot-instructions.md to make sure you do so."

---

### Entry #5 — 2025-10-15 15:25
> "in the #file:PromptLog.md, I see 'current time' - never do that, always use the exact time! Also fill all missing prompts from this conversation to the promptlog."

---

### Entry #6 — 2025-10-15 15:30
> "Read the instructions. Imagine it's finished. Answer this question: Is it going to be possible to have a workspace in VSCode, and have a specific set of KQL in there, that the Copilot will pick up as extra context?"

---

### Entry #7 — 2025-10-15 15:35
> "again, my prompt wasn't saved? always save my prompts to the #file:PromptLog.md - make sure that happens by altering #file:copilot-instructions.md"

---

### Entry #8 — 2025-10-15 15:40
> "Summarize #file:Instructions for me by giving me a short summary of the architecture."

---

### Entry #9 — 2025-10-15 15:45
> "Read the instructions. Imagine it's finished. Answer this question: will the MCP be able to get 'inspiration' from online sources as well. I know it can get inspiration from queries saved in the workspace (which it should), but additionally, I should be able to have online repos or other forms of documentation so it has most chance to create a decent query."

---

### Entry #10 — 2025-10-15 15:50
> "Add these missing capabilities to the #file:Instructions. It's important to give enough context to the agent; If there isn't enough context, the chance for compiling the right KQL query is lower."

---

### Entry #11 — 2025-10-15 15:55
> "Read the instructions. Imagine it's finished. Answer this question: will the MCP be able to get 'inspiration' from online sources as well. I know it can get inspiration from queries saved in the workspace (which it should), but additionally, I should be able to have online repos or other forms of documentation so it has most chance to create a decent query."

---

### Entry #12 — 2025-10-15 16:00
> "Summarize #file:Instructions for me by giving me a short summary of how the user experience will be of both installing all, and using it."

---

### Entry #13 — 2025-10-15 16:05
> "So that means, when starting the MCP, I will always get a dialog box, where it logs in to be able to execute queries against Azure Insights?"

---

### Entry #14 — 2025-10-15 16:10
> "Ah, so also the service-to-service authentication is foreseen in the instructions?"

---

### Entry #15 — 2025-10-15 16:15
> "If you would implement all code from #file:Instructions.md, what are the things that has to be clarified still? I don't want you to make too many decisions, so ask me now."

---

### Entry #16 — 2025-10-15 16:20
> "Here are my answers: 1. File-based cache 2. device_code (but document client_credentials well) 3. Few Shot Prompting with GitHub Copilot - filter local/online resources, LLM decides similarity, use examples to compile query 4. GitHub first, web scraping lower priority 5. No embeddings - filter by folder/filename (non-LLM), then LLM for similarity 6. Marketplace extension (free) 7. MCP starts when needed, or auto-start 8. Webview for results 9. Automatic MCP registration 10. Let queries fail with error (agent retries) - make retry count a setting 11. What is PII Sanitization? 12. Strict .kql format"

---

### Entry #17 — 2025-10-15 16:25
> "Business Central Telemetry should not contain PII information, but just in case, make it an opt-in setting, and apply it to both cached results and data sent to LLM."

---

### Entry #18 — 2025-10-15 16:30
> "I see this in the instructions: 'If you'd like, I can now scaffold the MCP TypeScript project and the minimal VSCode extension in this workspace. Tell me your choices' - why is that?"

---

### Entry #19 — 2025-10-15 16:35
> "Please clean up the #file:Instructions.md with a clean set of instructions that includes everything we talked about and agreed about!"

---

### Entry #20 — 2025-10-15 16:40
> "If you would implement all code from #file:Instructions.md, what are the things that has to be clarified still? I don't want you to make too many decisions, so ask me now."

---

### Entry #21 — 2025-10-15 16:45
> "### Entry #21 — 2025-10-15 16:45
> "Here are my answers: 1. MCP backend doesn't translate NL to KQL. The LLM (GitHub Copilot in VSCode) analyzes the user's natural language query and generates search terms. The MCP backend searches local .kql files and external references by content/filename using those search terms, then returns matching query examples to the LLM. The LLM decides which examples are similar and generates the final KQL based on the most relevant examples. This keeps the MCP simple: it's a search engine, not a translator. 2. Use the formal MCP JSON-RPC protocol (Model Context Protocol specification from Anthropic) — not just a custom REST API. This ensures compatibility with VSCode's MCP integration. 3. Monorepo with separate folders for MCP backend and VSCode extension (packages/mcp/ and packages/extension/). Single build command builds both packages. Single GitHub repository. 4. Extension naming: Display name 'BC Telemetry Buddy', package name 'bc-telemetry-buddy', publisher 'waldo'. 5. GitHub API authentication: Unauthenticated API access (60 requests/hour rate limit) — sufficient for fetching reference KQL from known repositories. Client can configure personal access token later if needed. 6. Web scraping: Deferred to v2 — focus on GitHub API for external references first. 7. Logging: MCP backend uses console output (for debugging), VSCode extension uses VSCode Output Channel (standard extension logging). 8. Workspace discovery: Extension passes workspace path to MCP backend via environment variable when spawning the MCP process. 9. MCP process lifecycle: One MCP process per workspace — extension spawns MCP on-demand (when workspace settings exist and user triggers query). 10. TypeScript configuration: ES2022 with ESM modules (modern JavaScript, better for MCP protocol compatibility)."

### Entry #22 — 2025-10-15 16:50
> "Read the instructions. Imagine it's finished. Answer this question: will the MCP be able to get 'inspiration' from online sources as well. I know it can get inspiration from queries saved in the workspace (which it should), but additionally, I should be able to have online repos or other forms of documentation so it has most chance to create a decent query."

### Entry #23 — 2025-10-15 16:52
> "Read the instructions. Imagine it's finished. Answer these questions: - Is it going to be possible to have a workspace in VSCode, and have a specific set of KQL in there, that the Copilot will pick up as extra context? - Is installation going to be easy? - Can I set up a connect per workspace? Or multiple connections may be? - Does it contain a VSCode extension that includes an MCP that adds tools to Github Copilot?"

### Entry #24 — 2025-10-15 16:55
> "Before you start creating the code, I want to add to the #file:copilot-instructions.md instructions some guidelines that I want you to strictly follow. 1. always create tests. I want to have tests for both MCP and VSCode Extension. I want to be able to run tests 2. documentation. I want user documentation on how to set up, update and use the functionality. I also want you to keep track of a ChangeLog for both the MCP as the VSCode Extension."

### Entry #25 — 2025-10-15 16:57
> "Add common best practices and SOLID principles to the #file:copilot-instructions.md as well."

### Entry #26 — 2025-10-15 17:00
> "Do you think we're ready to start generate the code based on what we have in #file:Instructions.md ?""

---
