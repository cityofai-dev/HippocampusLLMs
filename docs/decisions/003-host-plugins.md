# 003: Project-bound plugin packages and a separate Hermes provider

The runtime and environment-only constraints below are superseded by [004](004-review-and-runtime.md), which adds standalone runtime snapshots and profile configuration.

Keep host integrations outside core. Generate Claude/Codex local packages with absolute runtime/project paths to prevent an unspecified MCP working directory from selecting a database. Use compatibility manifests verified against installed client tooling. Generated packages deliberately depend on the existing compiled checkout; publication and a relocatable runtime bundle are separate work.

Hermes uses a standalone Python directory provider that calls the canonical CLI over bounded subprocesses, avoiding a second SQLite implementation. Lifecycle prefetch recalls context; capture remains an explicit tool action. No conversation synchronization, personal-memory mirroring or implicit confirmation is introduced. Environment-only selection limits this version to one project target per Hermes process; prefetch is synchronous and bounded. These constraints are preferable to silently mixing project and personal memories.
