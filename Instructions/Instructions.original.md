I want to create a tool in VSCode (a VSCode Extension) that is a mix of "Azure Data Explorer" and "ChatGPT".  And all that focused on Business Central Telemetry.

Here, you can find more information on Business Central Telemetry: https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/telemetry-overview

The tool should be able to query Application Insights data using Kusto Query Language (KQL) and provide insights and recommendations based on the telemetry data.  All from VSCode.

But I see it as an assistant.  So the user should be able to ask questions in natural language, and the tool should basically translate that into KQL queries, execute them, and then present the results in a user-friendly way.  

To make the tool self-learning, whenever it comes with good queries, it should be able to store them in a local form, so that next queries can have context of similar queries to be able to have a better understanding of what the user wants.  I see it as whenever the user is happy with a query, he can "save" it, and then the tool can use that as context for future queries.

The tool should also be able to provide recommendations based on the telemetry data.  For example, if the telemetry data shows that a system is slow because of a specific issue, the tool should be able to recommend a solution to that issue.

To have a set of references, the tool should be able to reference (in settings) to external sources (like GitHub repos, blogs, etc) to be able to learn from them and provide better recommendations.

If all this would be available in the VSCode Chat, that would be awesome.  If that is not possible, a custom UI would be fine as well - just make it a similar user experience.

The tool should have the following features:
1. **Natural Language Processing (NLP)**: The tool should be able to understand natural language queries and translate them into KQL queries.
2. **KQL Execution**: The tool should be able to execute KQL queries against Application Insights and retrieve the results.
3. **Result Presentation**: The tool should present the results in a user-friendly way, such as tables, charts, or graphs.
4. **Self-Learning**: The tool should be able to learn from previous queries and improve its understanding of user intent over time.
5. **Recommendations**: The tool should be able to provide recommendations based on the telemetry data.
6. **User Interface**: The tool should have a user-friendly interface within VSCode, allowing users to easily input queries and view results.
7. **Local Storage**: The tool should be able to store successful queries locally for future reference and context.