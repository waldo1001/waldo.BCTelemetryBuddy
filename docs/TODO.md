# TODOs

- I see the cache building up - shouldn't there be some kind of cleaning mechanism?

- new feature.  
  Working with configurable instruction sets to do an analysis.
  eg: a performance analysis, which has instructions on how to use the telemetry, which events, and so on.  
  The VSCode extension should have templates to create instructions sets, and should have pre-made ones for common analysis taks (like this performance one).
  The MCP should be able motivate the LLM to use these instructions together with the MCP's capabilities to do the analysis.
  Given a certain conversation in copilot, I need to be able to generate an instruction set.  So in a way, the MCP needs to be able to generate instructions sets, and store them in a way that the LLM can use them if being asked to do a certain type of analysis.