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
> "Do you think we're ready to start generate the code based on what we have in #file:Instructions.md ?"

### Entry #27 — 2025-10-15 17:02
> "I like your approach. Let's do the first point first: create monorepo structure based on the #file:Instructions.md"

### Entry #28 — 2025-10-15 17:05
> "Now create the UserGuide.md first to document the planned user experience."

### Entry #29 — 2025-01-14 17:10
> "Proceed to the next step: scaffolding the MCP backend implementation"

### Entry #30 — 2025-01-14 17:15
> "Continue creating all MCP backend modules following SOLID principles"

### Entry #31 — 2025-01-14 17:20
> "Scaffold the VSCode extension based on the #file:Instructions.md"

### Entry #32 — 2025-10-15 17:25
> "Time to Create tests. Create tests for the MCP modules."

### Entry #33 — 2025-10-15 17:30
> "Create tests for the MCP modules."

---

### Entry #34 — 2025-10-15 18:00
> "Now add tests for the VSCode Extension. Same minimum coverage."

---

### Entry #35 — 2025-10-15 18:30
> "Ok, for me to be able to do End to End testing, I'd like a comprehensive (don't exaggerate in the amount of detail - i'm not an idiot 😉) testscript of steps I should do to test this from VSCode (remember none of this is on the marketplace yet)."

---

### Entry #36 — 2025-10-15 18:45
> "While i'm setting things up to test, you can implement a best-practics set of Github Actions for CI/CD and Deployment of all the components."

---

### Entry #37 — 2025-10-15 19:00
> "I don't like that you commit and push from the agent. Never do that again, put that in the #file:copilot-instructions.md"

---

### Entry #38 — 2025-10-15 19:05
> "This time, read into this github action to see what the issue is: https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions/runs/18532071900/job/52817260291#step:7:12"

---

### Entry #39 — 2025-10-15 19:10
> "Do we have any integration tests? Do we have any tests that test the combo of the VSCode extension with the MCP server?"

---

### Entry #40 — 2025-10-15 19:15
> "I'll to E2E testing first. But here you see yet another issue in the CI pipeline: https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions/runs/18532282542/job/52818239329"

---

### Entry #41 — 2025-10-15 19:20
> "I added waldo.png - please use that as the logo for both"

---

### Entry #42 — 2025-10-15 19:25
> "Still an error when running the build: https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions/runs/18532773375/job/52819894754"

---

### Entry #43 — 2025-10-15 19:30
> "Can you add a default MIT license to the project?"

---

### Entry #44 — 2025-10-15 19:35
> "I notice you're not documenting my prompts anymore?"

---

### Entry #45 — 2025-10-15 19:40
> "Is our design walkthrough still up-to-date?"

---

### Entry #46 — 2025-10-15 19:45
> "And what about the changelog?"

---

### Entry #47 — 2025-10-15 19:50
> "I see there's till an issue with the build on Github; Here you find more info https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions/runs/18533452562/job/52822342829"

---

### Entry #48 — 2025-10-15 19:55
> "Still an issue. IN the 'Build All Packages' stage, I get this output in the 'package extension' part: [vsce: not found error]"

---

### Entry #49 — 2025-10-15 20:00
> "no promptlog?"

---

### Entry #50 — 2025-10-15 20:05
> "Still an issue. IN the 'Build All Packages' stage, I get this output in the 'package extension' part: [Error: invalid relative path: extension/../../.git/config - vsce including 627 files with parent directories]"

---

### Entry #51 — 2025-10-15 20:10
> "Promtlog, PROMPTLOG, PROMPTLOOOOOG"

---

### Entry #52 — 2025-10-15 20:15
> "I see there are no launch-files for me to be able to run from VSCode. Isn't that possible in this monorepo? If it is, please make it possible."

---

### Entry #53 — 2025-10-15 20:20
> "focus on all the problems in the problems pane, and solve them."

---

### Entry #54 — 2025-10-15 20:25
> "not clean at all - still 17 problems."

---

### Entry #55 — 2025-10-15 20:30
> "Still 16 problems"

---

### Entry #56 — 2025-10-15 20:35
> "in some magic way, you were able to solve 8 .. now focus on the others"

---

### Entry #57 — 2025-10-15 20:40
> "I noticed that this changelog is not respecting the order of time. Restructure so that the latest entry is above. Make sure to add to the #file:copilot-instructions.md that this is the way to structure the changelog."

---

### Entry #58 — 2025-10-15 22:32
> "MCP failed to start within timeout — run diagnostics and fix env var mapping between extension and MCP (BCTB_APP_INSIGHTS_ID / BCTB_KUSTO_URL / BCTB_CACHE_TTL)."

---

### Entry #59 — 2025-10-15 22:34
> "I noticed you're not logging my prompts?"

---

### Entry #60 — 2025-10-15 22:45
> "Again, you're not logging my prompts!"

---

### Entry #61 — 2025-10-15 22:46
> "how do you want me to continue the e2e test (See <attachments> above for file contents. You may not need to search or read the file again.)"

---

### Entry #62 — 2025-10-15 22:46
> "what are the options for the \"bctb.mcp.logLevel\" (See <attachments> above for file contents. You may not need to search or read the file again.)"

---

### Entry #63 — 2025-10-15 22:46
> "Output on the extension-host (in vscode after f5):\n\nBC Telemetry Buddy extension activated\nWorkspace settings detected, auto-starting MCP...\nStarting MCP server on port 52345...\nWorkspace: c:\\Temp\\bctb-test-workspace\nExtension ready\nMCP process exited with code 0\nFailed to auto-start MCP: MCP server failed to start within timeout period\n\nCould it be that I need to log in somewhere?  I don't get that  chance anywhere. (See <attachments> above for file contents. You may not need to search or read the file again.)"

---

### Entry #64 — 2025-10-15 22:46
> "You missed a few (See <attachments> above for file contents. You may not need to search or read the file again.)"

---

### Entry #65 — 2025-10-15 22:54
> "Yet again, you're lot loging my prompts .. I'm getting really sick of this.  Follow the instructions, please!  Every single prompt should be logged in the prompt log! (See <attachments> above for file contents. You may not need to search or read the file again.)"

---

### Entry #66 — 2025-10-15 22:54
> "No, not done, you missed a bunch (See <attachments> above for file contents. You may not need to search or read the file again.)"

---

### Entry #67 — 2025-10-15 22:58
> "Ok, tell me, how do we solve the issue of starting the MCP server"

---

### Entry #68 — 2025-10-15 22:59
> "Sidenote: stop using powershell to get current datetime to log the prompts.  Previously you never had to do that, and I don't want to 'allow' that script every single time.  Find another way to log the prompts - but log the prompts every single time of course"

---

### Entry #69 — 2025-10-15 23:00
> "Be specific on where i Need to run what.  Either here in this repo, or in the test-workspace."

---

### Entry #70 — 2025-10-15 23:01
> "when I start the MCP server, there is no output"

---

### Entry #71 — 2025-10-15 23:02
> "Please continue"

---

### Entry #72 — 2025-10-15 23:03
> "When I run now the extension, I get this in the output: [EADDRINUSE error on port 52345]"

---

### Entry #73 — 2025-10-15 23:04
> "We have progress! [MCP server started successfully] I'll continue e2e testing now"

---

### Entry #74 — 2025-10-15 23:05
> "running 3.1 in the #file:E2E-TestScript.md , I don't get anything in the output."

---

### Entry #75 — 2025-10-15 23:06
> "In the output window, I still get this: [output showing 'MCP already running' message]. But when running command 'start mcp server', I get a notification: MCP server started successfully"

---

### Entry #76 — 2025-10-15 23:07
> "may be you should change the #file:E2E-TestScript.md to update what the expected output is in this case?"

---

### Entry #77 — 2025-10-15 23:08
> "part 4 is me running a NL query through a new command palette. This was not part of the instructions. I was very clear to be making the MCP available for GitHub Copilot, so that I would be able to use you, Github copilot, to do the NL part, where the MCP would get queries, github copilot would check its similarity, create a KQL, where then the MCP would execute the query."

---

### Entry #78 — 2025-10-15 23:12
> "when running the query from 4.1, I get this output: [MCP ERROR] Query execution failed: TypeError [ERR_INVALID_ARG_TYPE]: The 'data' argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received undefined at Hash.update (node:internal/crypto/hash:140:11) at CacheService.generateKey"

---

### Entry #79 — 2025-10-15 23:13
> "Of course" (in response to "Would you like me to also update the documentation to log this fix?")

---

### Entry #80 — 2025-10-15 23:16
> "Yet again an error. Remember that I never got the chance to log in. So executing a query in App Insights is going to be difficult, no? [MCP ERROR] Query execution failed: AuthError: post_request_failed: Post request failed from the network, could be a 4xx/5xx or a network unavailability. Please check the exact error code for details. invalid_grant"

---

### Entry #81 — 2025-10-15 23:18
> "I don't think authentication is working: [MCP] === DEVICE CODE AUTHENTICATION === [MCP] undefined ================================== [MCP ERROR] Device code authentication failed: AuthError: post_request_failed: invalid_grant"

---

### Entry #82 — 2025-10-16 00:02
> "This time, authentication was successful, but when running the query, I get this: [MCP ERROR] Kusto query failed (404): unknown key 'v1' in path or following value for key is missing in cluster name"

---

### Entry #83 — 2025-10-16 00:10
> "Again, a step further - but not there yet. I'm able to log in, it is able to run a query (it seems), but.. [MCP] ✓ Query executed successfully, 1 table(s) returned... [MCP Client] query_telemetry <- Success... Attempt 1 failed: Cannot read properties of null (reading 'replace')... Attempt 2 failed... Attempt 3 failed"

---

### Entry #84 — 2025-10-16 00:15
> "For authentication, it shows me the message 'To sign in, use a web browser to open the page https://microsoft.com/devicelogin and enter the code D2YH6WEA3 to authenticate.' in the output window. Could you additionally show it as a notification in VSCode, where you have the option to navigate to the site, and where the code is already in the clipboard?"

---

### Entry #85 — 2025-10-16 00:20
> "I was wondering - since I have to log in every time I restart the MCP - would it be an option to work with 'az login', where the login is basically cached on the current windows session?"

---

### Entry #86 — 2025-10-16 00:25
> "azure_cli is working fine, and the query is getting executed - I'm moving on!"

---

### Entry #87 — 2025-10-16 00:27
> "how do I configure external references?"

---

### Entry #88 — 2025-10-16 00:30
> "I just executed the 'save query' - where is that query saved?"

---

### Entry #89 — 2025-10-16 00:32
> "the idea of the 'save query' is more to build some kind of codebase. So saving it in the .vscode folder doesn't make sense. It's more like a Src folder, or KQL folder, or ... and create subfolders as 'namespaces' or categories."

---

### Entry #90 — 2025-10-16 00:33
> "Yes please" (proceeding with implementation of workspace root queries folder with subfolder/category support)

---

### Entry #91 — 2025-10-16 01:15
> "(Copilot continues implementation after conversation summary)"

---

### Entry #92 — 2025-10-16 01:20
> "The implementation of 5.2 has changed - update the document"

---

### Entry #93 — 2025-10-16 01:25
> "This thing says 'option copilot integration'. That integration is not optional. It's actually the very reason of the existance of this workspace. I will never be running any NL query through the command palette. If it doesn't work through github copilot, this project is lost."

---

### Entry #94 — 2025-10-16 01:30
> "I want to start testing from GitHub copilot. Write me an End-to-end testscript for manual testing with GitHub copilot."

---

### Entry #95 — 2025-10-16 09:20
> "in 2.1, the dropdown doesn't give me any tools from this MCP server. Is there another way to test?"

---

### Entry #96 — 2025-10-16 09:25
> "Here is question and answer. it seems to just be reading the settings.json, not the actual mcp config: [Copilot response showing workspace settings instead of MCP tools]"

---

### Entry #97 — 2025-10-16 09:35
> "I don't think the MCP server is registered in VSCode. Like there should be an mcp.json somewhere (global) where the MCP server should be registered, no?"

---

### Entry #98 — 2025-10-16 09:40
> ### Entry #98 — 2025-10-16 09:40
> User implemented VSCode language model tool registration fix (extension.ts + package.json)

### Entry #99 — 2025-10-16 09:45
> "still not the case, but I don't see how it is registered in VSCode.  Shouldn't I have some kind of command palette command in the extension to be able to set up the MCP server in VSCode, so it adds the right settings to the mcp.json (global)?"

### Entry #100 — 2025-10-16 09:50
> "There is progress! Now it tries to automatically start the MCP server. But it fails. [Error log showing: Cannot find module 'c:\_Source\Community\waldo.BCTelemetryBuddy\packages\mcp\dist\index.js']"

### Entry #101 — 2025-10-16 09:52
> "new error: [MCP server starting but failing with EADDRINUSE on port 52345, and 'Failed to parse message' warnings for console.log output]"

### Entry #102 — 2025-10-16 10:00
> "When I ask the question 'Show me all errors from my Business Central telemetry in the last 24 hours', I would like to try to have the following flow: consult resources and filter them for anything 'telemetry' and 'error'... [detailed flow description]... Error: TypeError: o.content is not iterable"

### Entry #103 — 2025-10-16 10:35
> "I had a nice conversation with copilot regarding what I want to change... [Detailed task description]: Enhance BC Telemetry MCP to Use Query Patterns - Phase 1: Add Response Metadata, Phase 2: Auto-Pattern Matching"

---

### Entry #104 — 2025-10-16 10:40
> "I see your time on the promptlog and changelog is completely off... now, it's 10:35 in the morning, and you're logging it to be 16:10??"

---

### Entry #105 — 2025-10-16 10:45
> "It has been off for all entries added today. Apply the same time difference in both promptlog and changelog for all entries of today. - except the ones before 13:00"

---

### Entry #106 — 2025-10-16 10:50
> "I tested this question, and asked to explain... [Copilot says: 'the mcp_bc_telemetry__query_telemetry tool which can query telemetry using either KQL or natural language']. I don't see how the MCP can do the natural language part. The idea is that the MCP gives back possible queries for the LLM to interpret, no? ... Well - the pattern matching does have advantages, just make clear to the LLM that that's what happening, and that's the only thing it should expect from the tool. So option b I guess"

---

### Entry #107 — 2025-10-16 10:58
> "I have the feeling copilot relies too much on the query_telemetry and doesn't seem to try to get examples based on already existing data, or based on the tools available in the MCP. The first step should always be to try to get similar queries .. queries, not executing a query right away, while now, always it does the query_telemetry first. What can we do to facilitate this?"

---

### Entry #108 — 2025-10-16 11:05
> "Below is a query that results a list of eventid's that is very interesting to be used... [provided comprehensive KQL query for event catalog with descriptions, status, counts, Learn URLs]... I don't know what's best: create a new tool that gives you the option to get you the decent info about an event, or all events, Or incorporate this knowledge in all other tools."

---

### Entry #109 — 2025-10-16 11:10
> ### Entry #109 — 2025-10-16 11:10
> "Yes please! I follow your recommendation!" (to implement bctb_get_event_catalog and bctb_get_event_schema tools)

---

### Entry #110 — 2025-10-16 11:20
> "So what about the 'MCP ERROR' part?" (referring to startup output showing [MCP ERROR] for normal informational messages)

---

### Entry #111 — 2025-10-16 11:55
> "Still the same output, I'm afraid: [shows MCP ERROR messages still appearing, and VSCode warnings about 'Failed to parse message' for startup banner]"

---

### Entry #112 — 2025-10-16 12:00
> "regarding the MCP ERROR - there is one less: [but still showing some [MCP ERROR] prefixes]. And regarding the available tools: [only 7 tools discovered instead of 9]"

---

### Entry #113 — 2025-10-16 12:05
> "When talking about 'customers', BC Telemetry doesn't work with names, but TenantIds. So any question about a customername, should be mapped to a TenantId. [Provided KQL query for mapping companyName to aadTenantId]. Give the option to the LLM to actually do that - in fact, encourage the LLM to convert customernames, and always filter for aadTenantId after mapping it with the above query."

---

### Entry #114 — 2025-10-16 12:10
> "I tried to copy/paste a kql in the 'Run Natural Language query' .. but that didn't work. I would remove that command, and replace it with a 'run KQL query' .. and pretty much the same outcome in the webview"

---

### Entry #115 — 2025-10-16 12:15
> "The user experience of running a kql query is bad. Would we be able to make it possible to run a KQL query from an active document? Also, running a kql query from the new command, fails: [error logs showing query_telemetry sending wrong parameters]"

---

### Entry #116 — 2025-10-16 12:20
> "Investigate and fix the query execution error (generic 'Error: Error' message) and add command to run KQL from active document to improve UX."

---

### Entry #117 — 2025-10-16 12:25
> "Good start, but I imagine a 'run' link above any query in a KQL document. Could you do that?"

---

### Entry #118 — 2025-10-16 12:30
> "I don't see the codelens to run the query from within the document. Enable it by default if it is disabled. Also, when I run a query from the 'run from document', I get the same [Axios Error (status unknown): Error]."

---

### Entry #119 — 2025-10-16 12:35
> "Not good: [Error logs showing ECONNREFUSED - MCP server not running, auto-start failed with 'MCP server failed to start within timeout period']"

---

### Entry #120 — 2025-10-16 12:47
> "[AI-diagnosed issue] MCP server mode detection failed - child_process.spawn creates pipes for stdin/stdout/stderr by default, so process.stdin.isTTY is false in spawned MCP process, causing it to start in stdio mode instead of HTTP mode. Extension then tries to communicate via HTTP port 52345 but server is listening on stdin/stdout."

---

### Entry #121 — 2025-10-16 13:05
> "the command 'Run KQL from Document' works. But I still don't see the codelens."

---

### Entry #122 — 2025-10-16 13:15
> "I enabled it in settings.json, and BAM - works! BUT.. I'm seeing 'Run Query' twice now..."

---

### Entry #123 — 2025-10-16 13:25
> "In terms for folder structuring. From the moment we're talking 'customer' (so basically, when saving a query that filters on a tenantid or companyname), the root folder should be 'Companies' and then the subfolder the companyname (customername), and then kind of the same structure as the generic queries (that don't filter on any tenant or company)"

---

### Entry #124 — 2025-10-16 15:25
> "I get: Error: listen EADDRINUSE: address already in use :::52345 [...] Can't you make that process a bit more stable? If the port already is in use, then probably the server is already started by another instance??"

---


```

