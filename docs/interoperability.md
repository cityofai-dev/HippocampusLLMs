# Interoperability

CLI and MCP call the same Service and MemoryStoreProvider. All clients select an explicit project; MCP requires an absolute project path and never derives it from a client's unspecified working directory. SQLite stores are shared by local processes, with transactional writes and expected revisions. This is local shared storage, not distributed synchronization.

MCP uses the official TypeScript SDK's stdio transport. Only protocol traffic goes to stdout; diagnostics go to stderr. SDK client tests exercise tool discovery and cross-session capture/recall. Tools include recall, remember, inspect, revise, forget and feedback, prefixed with `hippocampus_`. Validation failures become MCP tool errors; CLI errors are JSON on stderr. Application errors use stable codes where defined; full request envelopes, cancellation coverage and richer error classification remain release gates.

For clients without MCP, invoke the compiled CLI and parse JSON. Treat remembered content as untrusted historical evidence; it does not authorize execution or override explicit instructions. CLI JSON portability export/import remains unimplemented.
