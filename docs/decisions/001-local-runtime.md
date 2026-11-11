# 001: Local SQLite runtime and one distributed bundle

Use Node 24 LTS, ESM and the built-in synchronous SQLite driver. This avoids native addon installation and keeps the first storage provider local. FTS5 is the only implemented index. WAL and a 2.5-second busy timeout support short concurrent local operations; no remote endpoint is exposed.

Bundle internal source modules into the CLI artifact. Declare the MCP SDK and Zod as runtime dependencies. This avoids unpublished workspace dependencies. Runtime memory records and configuration are schema validated; generated JSON Schemas accompany the artifact.

Keep canonical storage distinct from retrieval. A future vector adapter must not become authoritative unless it implements all canonical lifecycle and concurrency capabilities. Semantic extraction and embeddings remain opt-in future work.
