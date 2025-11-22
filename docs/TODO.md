# TODOs

new feature.  
  Working with configurable instruction sets to do an analysis.
  eg: a performance analysis, which has instructions on how to use the telemetry, which events, and so on.  
  The VSCode extension should have templates to create instructions sets, and should have pre-made ones for common analysis taks (like this performance one).
  The MCP should be able motivate the LLM to use these instructions together with the MCP's capabilities to do the analysis.
  Given a certain conversation in copilot, I need to be able to generate an instruction set.  So in a way, the MCP needs to be able to generate instructions sets, and store them in a way that the LLM can use them if being asked to do a certain type of analysis.
  The instructions should also include default folder creation for saving the resulting MD file (the analysis).  same as already for queries: analysis/{company}/analysis type/
  The instructions should include to save all used queries for the analysis into the same folder (next to the analysis md file).  in the md file-refer to the analysis.
  Obviously, when performing instructions, we need to make sure to give these instructions to the LLM so it knows what kind of data we expect, what the flow is, the tools that should be used, and so on.




add BC specific knowledge for the LLM to take into account
LIke SQL Query details: what is what
SHuld basically be some kind of file that the LLM can interpret to take into their analysis.





Improve workings by adding "suggestions" to the output of the tasks.
For example:
- when using step "get_event_catalog", add suggestion to look into the fields.
- when using the query tool, and there is no filter on "tenantid", suggest to add such a filter for better performance.
- When using get_event_datalog for a limited amount of events, suggest to read into the URLs that are given in the output for further analysis.
