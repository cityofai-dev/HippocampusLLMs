# 004: Review drafts, evidence checks and self-contained plugin runtimes

Pending proposals live in a separate project-indexed SQLite table under forward migration 3. Acceptance wraps revision validation, canonical mutation and draft deletion in one write transaction. Rejection removes draft content. The same application tool schemas drive MCP, CLI dispatch and Hermes; core remains independent of host SDKs. Direct capture remains available for explicit remember requests.

Evidence checks are injected through a core interface. The filesystem adapter snapshots bounded project-relative files and compares hashes on demand. Verification remains an explicit claim with provenance; changed bytes produce review items, not automatic invalidation. Unsupported evidence is reported honestly.

Plugin builds bundle runtime dependencies ahead of time and install immutable runtime snapshots under the explicitly selected project's ignored state directory. Launch definitions refer to this stable absolute path, surviving source-checkout moves and host plugin-cache changes. Node and project relocation require rebuilding. This avoids undocumented host-specific path interpolation and runtime package downloads. Owned artifact removal retains shared runtime snapshots and canonical memories.

The scripted cross-client demo and default retrieval tests require no model. An optional live Codex context-injection experiment reports task outcomes separately, with explicit provider/model settings. It does not establish automatic MCP tool use or broad quality improvements.
