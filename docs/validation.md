# Validation record

Last checked locally on macOS with Node.js 26.8.1. The CI workflow is configured for Node.js 24 on Ubuntu, macOS and Windows; only the macOS run was executed in this workspace.

## Checks

- `npm run lint`: passed (Prettier and strict TypeScript checking).
- `npm test`: 12 integration tests passed. They cover persistence across processes, project isolation, relevance and empty results, serialized context budgets, revisions and concurrent writers, deletion, configuration validation and precedence, lifecycle filters, adapter preservation, vector indexing and two independent MCP SDK clients.
- `npm run evaluate`: passed on a committed synthetic set of 12 memories and 12 queries. See results below. This measures retrieval against fixture labels; it does not measure agent task outcomes.
- `npm run smoke:published`: installed the published `@hippocampusllms/cli@0.2.0` into an isolated temporary project without monorepo development dependencies, then passed `init`, preset selection, `remember` and hybrid `recall`.
- `npm run smoke:hosts`: Claude Code's isolated user-scoped MCP entry passed its live stdio health check. Codex's isolated entry was recognized as enabled with the expected stdio command. `codex mcp list` does not invoke the server, so a live Codex tool call remains unverified.

## Synthetic retrieval comparison

The fixed-file baseline injects all 12 fixture memories for every task. Context estimate is the sum of serialized result bytes divided by three. Latency includes repeated CLI startup and is machine-dependent.

| Strategy                   | Precision | Recall | Stale rate | Irrelevant-query false-positive rate | Context estimate |
| -------------------------- | --------: | -----: | ---------: | -----------------------------------: | ---------------: |
| No memory                  |         0 |      0 |          0 |                                    0 |               12 |
| Fixed instruction file     |     0.076 |  1.000 |      0.083 |                                1.000 |             5352 |
| SQLite lexical             |     0.846 |  1.000 |          0 |                                    0 |             1113 |
| SQLite hybrid              |     0.846 |  1.000 |          0 |                                    0 |             1113 |
| SQLite local token vectors |     0.846 |  1.000 |          0 |                                    0 |             1113 |

The three retrieval modes tie on this small fixture. It uses exact overlapping terms and cannot demonstrate semantic retrieval or a vector quality advantage. The local vectors hash tokens into 256 dimensions; they are not embeddings. An exact-token overlap guard filters hash collisions and requires at least two shared terms where the query contains two or more. The measurements are a baseline for future evaluation, not a broad quality claim.

## Remaining release verification

- Live Codex MCP tool invocation and automatic tool-use behavior.
- Linux and Windows CI results; these are configured but were not run locally.
- Cancellation, process interruption during migrations, high-contention stress, copied project identity detection and evidence freshness.
- Export/import and canonical store migration are not implemented. PostgreSQL, Qdrant, pgvector and semantic embeddings are planned providers and are not selectable.
- No end-to-end agent benchmark has been run. Evaluation requires no paid API key and reports retrieval metrics only.
