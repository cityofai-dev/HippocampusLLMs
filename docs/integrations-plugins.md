# Hermes, Claude Code and Codex plugins

These integrations use the same local canonical store and application validation. They do not synchronize separate machines. No host settings are changed by building artifacts. Avoid enabling both a plugin MCP server and a standalone connection for the same project.

## Claude Code and Codex local packages

Build from the repository, initialize your target project, then generate project-bound packages:

```bash
npm run build
node packages/cli/dist/index.js init --project "/absolute/path/my project"
node packages/cli/dist/index.js plugin build claude --project "/absolute/path/my project" --output "/absolute/path/new-artifacts/claude" --dry-run
node packages/cli/dist/index.js plugin build claude --project "/absolute/path/my project" --output "/absolute/path/new-artifacts/claude"
node packages/cli/dist/index.js plugin build codex --project "/absolute/path/my project" --output "/absolute/path/new-artifacts/codex"
claude plugin validate "/absolute/path/new-artifacts/claude"
claude --plugin-dir "/absolute/path/new-artifacts/claude"
```

`hippocampus plugin build claude|codex` is available from the installed CLI too. It checks configuration and bundled runtime availability, previews exact paths and installation arguments with `--dry-run`, and refuses existing destinations. Without `--output`, artifacts go under `.hippocampus/plugins/HOST`.

Builds snapshot the complete compiled runtime and dependencies into a content-addressed `.hippocampus/plugin-runtimes/` file. MCP launches that snapshot, so moving or removing the source checkout does not break the integration. Node 24+ at the recorded executable path and the target project's absolute path must remain available. Rebuild after moving either. Runtime snapshots and default artifacts are narrowly ignored in Git. No package installation or network access occurs during plugin builds.

Each artifact also contains the runtime, license and memory skill. Artifacts bind to this specific project; they do not automatically select a new database from a host working directory. The repository convenience command `npm run package:plugins -- --project ABSOLUTE_PATH --output NEW_DIRECTORY` builds both hosts.

For Codex CLI versions supporting plugins:

```bash
codex plugin marketplace add "/absolute/path/new-artifacts/codex"
codex plugin add hippocampus@hippocampus-local
```

These explicit install commands modify the user's client settings. Review generated files first. Use `codex plugin remove hippocampus@hippocampus-local` to uninstall and `codex plugin marketplace remove hippocampus-local` to remove the source. Claude's `--plugin-dir` loads only for the invocation; omit it to disconnect. Neither operation deletes project memories. After disconnecting the client, preview and remove only owned artifact files:

```bash
hippocampus plugin remove codex --project "/absolute/path/my project" --output "/absolute/path/new-artifacts/codex" --dry-run
hippocampus plugin remove codex --project "/absolute/path/my project" --output "/absolute/path/new-artifacts/codex"
```

Removal refuses artifacts containing unowned files. Shared runtime snapshots remain available to other installed clients; project memory is retained.

Both packages use the documented compatibility manifests, `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`. The skill guides recall before relevant work and explicit capture after verification. It does not guarantee tool invocation or enable lifecycle hooks. Existing `hippocampus connect claude/codex` remains the alternative for MCP-only configuration.

References: [Claude manifest](https://code.claude.com/docs/en/plugins-reference), [Codex packaging and compatibility layouts](https://developers.openai.com/plugins/build/plugins).

## Hermes MCP connection

In the active Hermes profile's `config.yaml`, merge this entry under `mcp_servers`, preserving other servers. Replace all paths with actual absolute paths; express arguments as separate YAML items:

```yaml
mcp_servers:
  hippocampus:
    command: /absolute/path/to/node
    args:
      - /absolute/path/HippocampusLLMs/packages/cli/dist/index.js
      - serve
      - --transport
      - stdio
      - --project
      - /absolute/path/my project
```

Restart Hermes. Ask it to call `hippocampus_recall`, record a concise synthetic finding, then recall it from a fresh session. MCP alone makes tools available; it does not replace Hermes's memory provider. Remove only this entry to disconnect.

Reference: [Hermes MCP configuration](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp).

## Separate Hermes native provider

`plugins/hermes` is a standalone directory provider; it does not patch Hermes core. Copy its contents into `$HERMES_HOME/plugins/hippocampus/` for the profile you intend to use. Install the Hippocampus CLI first (for source development, `npm link --workspace packages/cli`). Use `hermes memory setup` to configure the provider's project and executable fields, or write this provider-owned configuration to the active profile's `$HERMES_HOME/hippocampus.json`:

```json
{
  "project": "/absolute/path/my project",
  "command": "/absolute/path/to/hippocampus",
  "environment": "production",
  "component": "auth"
}
```

The project and command are required to resolve an initialized project and executable. Environment, workspace and component are optional defaults for recall. Profile settings take precedence over `HIPPOCAMPUS_PROJECT` and `HIPPOCAMPUS_COMMAND` environment fallbacks. Each initialized provider freezes the settings for its own `hermes_home`; two profiles in one process can select different projects. Restart after changing configuration. Setup validates the candidate and replaces the profile JSON atomically.

Select `memory.provider: hippocampus` in that profile's `config.yaml`, preserving other memory settings, then restart Hermes. To disconnect, restore the previous provider selection and restart; retain the project database.

Lifecycle behavior:

- Initialization freezes the canonical project path, checks availability offline and probes the local CLI.
- `prefetch` recalls at most a 1200 estimated-token capsule for the incoming query. Restricted records lacking matching context are excluded by the application service.
- Nine native tools use the same generated schemas as MCP, including rich capture, optimistic revisions, proposals and review. Captures retain Hermes session provenance and remain hypotheses by default. Primary agent contexts may write; other contexts cannot.
- Session switching updates capture provenance. Inherited turn-sync, compression and session-end methods store nothing. Built-in `MEMORY.md` / `USER.md` writes are not mirrored.
- CLI calls have a five-second timeout, use argument arrays and never invoke a shell. Prefetch currently waits synchronously for the local CLI; background caching is future work. Invalid writes propagate a failure. There is no transcript extraction or evidence verification service.

Native capture supports rationale, evidence, scope, applicability, relations, verification and exact idempotency keys. Revision conflicts are returned as failures. Session provenance is supplied by the provider. See [review and evidence freshness](review-and-recall.md) for the shared lifecycle. Do not enable a duplicate native/MCP tool surface without checking host naming behavior.

Reference: [Hermes provider contract](https://hermes-agent.nousresearch.com/docs/developer-guide/memory-provider-plugin).

## Validation

`npm test` covers generation, overwrite refusal and launching both generated MCP definitions from an unrelated directory with spaces in the project path. The optional real-Hermes smoke check requires its installed Python environment:

```bash
PYTHONPATH="/absolute/path/hermes-agent" "/absolute/path/hermes-agent/venv/bin/python" scripts/hermes-smoke.py "/absolute/path/to/node"
```

This exercises the real Hermes `MemoryProvider` base class and `MCPServerTask`: native cross-instance persistence, structured schemas, idempotency, stale revision rejection, two-profile isolation, transcript exclusion, session switching, subagent write rejection and MCP recall. It requires no model credentials. This optional check uses Hermes internals and may need adjustment when Hermes changes.

Locally checked against Hermes 0.21.1 (upstream 98f758ae, locally modified installation), Claude Code 2.1.325 and Codex CLI 0.167.2 on macOS. Claude manifest validation and Hermes transport invocation were run. Codex marketplace registration, plugin installation and enabled listing passed in an isolated temporary CODEX_HOME. Full model-driven tool selection, automatic hooks, Linux/Windows provider behavior and marketplace publication are unverified.
