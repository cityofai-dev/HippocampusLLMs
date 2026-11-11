# Verification record

Verified locally on macOS:

- Strict TypeScript checking and Prettier checks pass.
- Eight integration tests pass under Node 26 and the Node 24 baseline. Tests cover cross-process persistence, irrelevant recall, isolation, stale revisions, deletion, budgets, atomic configuration rejection, non-TTY behavior, adapter preservation/idempotency, concurrent writers, environment restrictions, archival, configuration precedence, and two official SDK MCP clients.
- The packed artifact installs in a clean temporary project with `--omit=dev --ignore-scripts`, and its compiled executable initializes a path containing spaces, remembers a decision and recalls it. No monorepo runtime imports or development dependencies are needed.
- npm audit reports zero known vulnerabilities after upgrading Zod to 4.6.7.
- The committed four-task synthetic retrieval fixture yields selective precision 1, recall 1 and stale rate 0. The fixed-file baseline yields precision 0.1875, recall 1 and stale rate 0.25; no memory yields recall 0. This tiny fixture does not establish general retrieval quality or end-to-end agent task performance. Latency includes CLI startup and varies by host.

Not yet verified: live Claude Code/Codex sessions, Windows/Linux CI runs, process interruption during migrations, cancellation, large-scale contention, copied-identity detection, full request envelopes, and evidence freshness. Export/import, store migration and semantic consolidation remain unimplemented. Vector/embedding providers remain planned.
