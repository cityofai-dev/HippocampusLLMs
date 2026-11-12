# Validation record

Last checked locally on macOS with Node.js 26.8.1. The CI workflow is configured for Node.js 24 on Ubuntu, macOS and Windows; only the macOS run was executed in this workspace.

## Checks

- `npm run lint`: passed (Prettier and strict TypeScript checking).
- `npm test`: 12 integration tests passed. They cover persistence across processes, project isolation, relevance and empty results, serialized context budgets, revisions and concurrent writers, deletion, configuration validation and precedence, lifecycle filters, adapter preservation, vector indexing and two independent MCP SDK clients.
- `npm run smoke`: packed the local 0.2.1 workspace package, installed it outside the monorepo without dev dependencies, and passed `init`, `remember` and `recall`.
- `npm run evaluate`: passed on a committed synthetic set of 20 memories and 24 tasks, including paraphrases, near duplicates, contradictory memories, API-version distinctions, stale records and irrelevant queries. It measures retrieval against fixture labels; it does not measure agent task outcomes.
- `npm run smoke:published`: installed the published `@hippocampusllms/cli@0.2.0` into an isolated temporary project without monorepo development dependencies, then passed `init`, preset selection, `remember` and hybrid `recall`.
- `npm run smoke:hosts`: Claude Code's isolated user-scoped MCP entry passed its live stdio health check. Codex's isolated entry was recognized as enabled with the expected stdio command. `codex mcp list` does not invoke the server, so a live Codex tool call remains unverified.

## Synthetic retrieval comparison

The fixed-file baseline injects all 20 fixture memories for every task. Context estimate is the sum of serialized result bytes divided by three. Latency includes repeated CLI startup and is machine-dependent.

| Strategy                   | Precision | Recall | Stale rate | Empty-task false-positive rate | Context estimate | Latency | Agent task outcomes |
| -------------------------- | --------: | -----: | ---------: | -----------------------------: | ---------------: | ------: | ------------------- |
| No memory                  |         — |  0.000 |          0 |                              0 |               24 |    0 ms | Not measured        |
| Fixed instruction file     |     0.046 |  1.000 |      0.100 |                          1.000 |            19200 |    0 ms | Not measured        |
| SQLite lexical             |     0.667 |  0.818 |          0 |                              0 |             2392 | 3013 ms | Not measured        |
| SQLite hybrid              |     0.667 |  0.818 |          0 |                              0 |             2392 | 3019 ms | Not measured        |
| SQLite local token vectors |     0.667 |  0.818 |          0 |                              0 |             2392 | 3003 ms | Not measured        |

All three retrieval modes recalled every exact, version-specific, conflict and near-duplicate case, but recalled none of the four paraphrase cases. They tie because this index stores hashed word tokens, not semantic embeddings. The shared-token guard prevents hash collisions from surfacing as unrelated matches. These results do not support adding a semantic or remote vector provider yet; first add a measured embedding candidate to this same evaluation and compare quality, latency and privacy cost. Task outcomes were not measured because no agent model was used. This synthetic result is a baseline, not a broad quality claim.

## Remaining release verification

- Live Codex MCP tool invocation and automatic tool-use behavior.
- Linux and Windows CI results; the Node 24 matrix now checks both the repository-built tarball and the published 0.2.0 package, but those CI jobs have not run for this change yet.
- Cancellation, process interruption during migrations, high-contention stress, copied project identity detection and evidence freshness.
- Export/import and canonical store migration are not implemented. PostgreSQL, Qdrant, pgvector and semantic embeddings are planned providers and are not selectable.
- No end-to-end agent benchmark has been run. Evaluation requires no paid API key and reports retrieval metrics only.
