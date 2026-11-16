# Validation record

Last checked locally on macOS with Node.js 26.8.2. The CI workflow is configured for Node.js 24 on Ubuntu, macOS and Windows; only the macOS run was executed in this workspace.

## Checks

- `npm run lint`: passed (Prettier and strict TypeScript checking).
- `npm test`: 23 tests passed. They cover persistence across processes, project isolation, relevance and empty results, serialized context budgets, revisions and concurrent writers, deletion, configuration validation and precedence, lifecycle filters, adapter preservation, vector indexing and two independent MCP SDK clients. New checks cover draft exclusion/review, stale and concurrent acceptance, version-2 database upgrade, proposal project isolation, evidence drift/path escapes, budgeted explanations, standalone plugin runtimes, owned removal, and the scripted cross-client correction/forgetting example.
- `npm run smoke`: packed the local 0.3.0 workspace package, installed it outside the monorepo without dev dependencies, and passed `init`, `remember`, `recall`, plugin preview/build and inspection through the standalone runtime.
- `npm run evaluate`: passed on a committed synthetic set of 20 memories and 24 tasks, including paraphrases, near duplicates, contradictory memories, API-version distinctions, stale records and irrelevant queries. It measures retrieval against fixture labels; it does not measure agent task outcomes.
- `npm run smoke:published`: installed the published `@hippocampusllms/cli@0.2.0` into an isolated temporary project without monorepo development dependencies, then passed `init`, preset selection, `remember` and hybrid `recall`.
- `npm run smoke:hosts`: Claude Code's isolated user-scoped MCP entry passed its live stdio health check. Codex's isolated entry was recognized as enabled with the expected stdio command. `codex mcp list` does not invoke the server, so a live Codex tool call remains unverified.

## Synthetic retrieval comparison

The fixed-file baseline injects all 20 fixture memories for every task. Context estimate is the sum of serialized result bytes divided by three. Latency includes repeated CLI startup and is machine-dependent.

| Strategy                   | Precision | Recall | Stale rate | Empty-task false-positive rate | Context estimate | Latency | Agent task outcomes |
| -------------------------- | --------: | -----: | ---------: | -----------------------------: | ---------------: | ------: | ------------------- |
| No memory                  |         — |  0.000 |          0 |                              0 |               24 |    0 ms | Not measured        |
| Fixed instruction file     |     0.046 |  1.000 |      0.100 |                          1.000 |            19200 |    0 ms | Not measured        |
| SQLite lexical             |     0.679 |  0.864 |          0 |                              0 |             2490 | 2970 ms | Not measured        |
| SQLite hybrid              |     0.679 |  0.864 |          0 |                              0 |             2550 | 3050 ms | Not measured        |
| SQLite local token vectors |     0.667 |  0.818 |          0 |                              0 |             2392 | 3058 ms | Not measured        |

These corrected results supersede the earlier table: the old evaluator applied all presets before running the comparisons, so every retrieval label actually ran in vector mode. The evaluator now sets and asserts the configured mode for each strategy. Lexical and hybrid recall one of four paraphrase cases; local token vectors recall none. All modes recall the exact, version-specific, conflict and near-duplicate fixtures. This small synthetic set does not establish general quality or a benefit for local token vectors. Latency includes CLI startup.

## Plugin and lifecycle checks

- Claude Code 2.1.325 validated the generated plugin; a missing directory-listing icon remains advisory for local use.
- Codex CLI 0.167.2 registered the generated marketplace, installed plugin version 0.3.0 and listed it enabled under a temporary isolated CODEX_HOME. Normal user configuration was unchanged.
- Hermes 0.21.1 (upstream 98f758ae, locally modified installation) passed the real-provider smoke test: shared rich schemas, idempotency, revision conflicts, two-profile isolation, transcript exclusion, subagent write guard and actual Hermes MCP transport recall. No model keys were needed.
- `npm run evaluate:agents` completed the three-strategy dry run. It reports null task outcomes and repeated failures because no model was invoked. The optional live Codex runner is implemented but its model execution remains unverified. See [agent evaluation](agent-evaluation.md).

## Remaining release verification

- Live Codex MCP tool invocation and automatic tool-use behavior.
- Linux and Windows CI results; the Node 24 matrix now checks both the repository-built tarball and the published 0.2.0 package, but those CI jobs have not run for this change yet.
- Cancellation, process interruption during migrations, high-contention stress, copied project identity detection, and commit/symbol/external evidence verification.
- Export/import and canonical store migration are not implemented. PostgreSQL, Qdrant, pgvector and semantic embeddings are planned providers and are not selectable.
- No end-to-end agent benchmark has been run. Default evaluation requires no paid API key; the opt-in model task benchmark has not been executed.
