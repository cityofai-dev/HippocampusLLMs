# Hippocampus Hermes provider

Standalone directory provider for explicit project memories and per-turn contextual recall. Requires Hermes with the `agent.memory_provider.MemoryProvider` interface, Node.js 24+ and an installed `hippocampus` CLI. No Python dependencies are added.

Copy this directory to the active profile's `$HERMES_HOME/plugins/hippocampus/`, configure its initialized absolute project path and CLI executable using `hermes memory setup` or the active profile’s `hippocampus.json`. Select `memory.provider: hippocampus` and restart Hermes.

Each provider instance freezes its own profile configuration; process environment settings are fallbacks only. It does not save transcripts or mirror global personal memories. Nine native tools share the MCP schemas for scoped recall, rich capture, evidence, idempotency, optimistic corrections, deletion and review proposals. Local subprocess calls time out after five seconds. Removing the provider does not delete project memories.

See the repository's [integration guide](../../docs/integrations-plugins.md) for configuration, verification and limitations. MIT licensed; see the repository LICENSE.
