# Architecture and delivery gates

The shared Service is called by both CLI and MCP. Core contains no host adapter or model SDK imports. Storage uses parameterized SQL, an FTS5 index and a versioned forward migration. The CLI is compiled and bundled using esbuild; npm runtime dependencies are declared explicitly.

Canonical project identity is separate from the optional workspace scope in the domain model. Project isolation is enforced in store reads. Restricted applicability requires matching caller context; missing context never matches a restricted record.

Initial tradeoff: use Node 24's built-in synchronous SQLite driver to avoid native installation scripts. Operations are bounded and local; expensive remote work is outside the implementation. Forward migrations reject newer schemas. SQLite busy waits last at most 2.5 seconds.

Release gates still outstanding include origin explanations, full host capability detection, advanced lifecycle operations, cancellation tests, interrupted migrations and contention tests, copied identity detection and platform matrix verification. The current implementation is a functional initial vertical slice, not completion of every AGENTS.md acceptance criterion.
