# HippocampusLLMs

HippocampusLLMs is a local project memory CLI and stdio MCP server for coding agents. It records concise decisions, constraints, corrections and experiences, then selects matching records within an estimated context budget. It does not train model weights or store conversations automatically.

This repository contains an initial working local implementation. SQLite persistence, FTS5 recall, explicit capture, revision checks, deletion, project configuration, a configuration wizard, generated JSON Schemas and six MCP tools are implemented. Host setup supports project configuration installation, dry-run previews, backups and managed removal. Export/import, store migration and semantic consolidation are not implemented. The package has not been published and npm scope ownership has not been verified.

## Prerequisites and development

Use Node.js 24 LTS or newer and npm. The runtime uses `node:sqlite`; no native addon compilation or API keys are required. SQLite APIs may emit an experimental warning on some Node releases; warnings go to stderr.

```bash
npm ci
npm run build
npm run typecheck
npm run lint
npm test
npm run evaluate
node packages/cli/dist/index.js help
```

The root is an npm workspace. `packages/core/src` contains domain types, provider contracts and shared services; `packages/storage-sqlite/src` contains transactions, migrations and FTS5; `packages/mcp/src` exposes the shared services; `packages/cli/src` contains project configuration and commands. The build bundles repository source into one compiled ESM CLI, leaving declared npm dependencies external.

## Quickstart and two sessions

From the repository, use an absolute path to the compiled CLI. Replace `/absolute/path/HippocampusLLMs` with your checkout path.

```bash
node /absolute/path/HippocampusLLMs/packages/cli/dist/index.js init --project /absolute/path/my-project
node /absolute/path/HippocampusLLMs/packages/cli/dist/index.js remember --project /absolute/path/my-project --kind decision --content "Refresh token rotation requires a database transaction" --source "Explicit user decision"
```

In a new terminal, recall the same project memory. Copy the ID from the result for the next commands.

```bash
node /absolute/path/HippocampusLLMs/packages/cli/dist/index.js recall "refresh token" --project /absolute/path/my-project --budget 1500 --json
node /absolute/path/HippocampusLLMs/packages/cli/dist/index.js inspect MEMORY_ID --project /absolute/path/my-project --json
node /absolute/path/HippocampusLLMs/packages/cli/dist/index.js revise MEMORY_ID --project /absolute/path/my-project --content "Refresh token rotation requires a serializable transaction" --expected-revision 1
node /absolute/path/HippocampusLLMs/packages/cli/dist/index.js forget MEMORY_ID --project /absolute/path/my-project
```

All command results use JSON. Diagnostics use stderr. Stale revisions return `REVISION_CONFLICT` and exit 3; other failures exit 1. An explicit remember request is accepted or rejected with an error. Records default to hypothesis verification; recall never promotes their verification state. FTS5 selects lexical matches, filters status and validity, and includes provenance. Unrelated queries can return no records. The budget counts compact serialized JSON using UTF-8 bytes divided by three; this is an estimate, not a model tokenizer. Pretty-print whitespace and MCP protocol envelopes are outside that application budget.

## Configuration

`init` creates `.hippocampus/config.json`, a stable project UUID and a local SQLite database. Repeated initialization preserves the UUID. Database paths resolve relative to the config directory. Configuration can be committed; database files are ignored.

```bash
node packages/cli/dist/index.js config
node packages/cli/dist/index.js config show --json
node packages/cli/dist/index.js config get storage.provider
node packages/cli/dist/index.js config set retrieval.maxContextTokens 1200
node packages/cli/dist/index.js config validate
node packages/cli/dist/index.js config test
node packages/cli/dist/index.js doctor
```

The wizard requires a TTY, previews its candidate and asks before saving. Automation commands work without a TTY. Unknown fields, future schema versions and unsupported providers fail validation. Whole candidates are validated before an atomic rename. A nonempty database prevents changing its configured path. No automatic data migration is offered.

```json
{
  "schemaVersion": 1,
  "projectId": "c4fc7ce1-28c1-468c-a110-632552c36922",
  "storage": { "provider": "sqlite", "sqlite": { "path": "./memory.sqlite" } },
  "retrieval": {
    "mode": "lexical",
    "maxContextTokens": 1500,
    "vector": { "provider": "none" }
  },
  "embeddings": { "provider": "none" },
  "capture": { "mode": "explicit" },
  "privacy": { "telemetry": false }
}
```

SQLite is the authoritative canonical store. FTS5 is a retrieval index. PostgreSQL, Qdrant, pgvector and embeddings are planned, and cannot be selected. Provider discovery is available in `doctor`. No remote provider settings or credentials are accepted by this version. Future adapters must use environment variable references rather than secret values. `config show/get/set/validate --scope user` manages defaults in `$XDG_CONFIG_HOME/hippocampus/config.json` or `~/.config/hippocampus/config.json`. Resolution is built-in defaults, user defaults, project config, `HIPPOCAMPUS_MAX_CONTEXT_TOKENS`, then recall `--budget`. Full project settings override user defaults; user configuration cannot specify project identity. Origin reporting remains pending.

## MCP and coding agents

Start the server with an explicit absolute project path:

```bash
node /absolute/path/HippocampusLLMs/packages/cli/dist/index.js serve --transport stdio --project /absolute/path/my-project
```

The server exposes `hippocampus_recall`, `hippocampus_remember`, `hippocampus_inspect`, `hippocampus_revise`, `hippocampus_forget` and `hippocampus_feedback`. Feedback is stored separately from recall selection and does not promote verification. Configuration changes cause subsequent calls to request a restart. Stdout is reserved for MCP traffic.

`connect claude --dry-run` and `connect codex --dry-run` preview changes without modifying client files. Omit `--dry-run` to install project settings; `disconnect <host>` removes managed entries. Existing unrelated settings are preserved. Backups use the `.hippocampus.bak` suffix; restore that file manually to roll back. Codex supports explicit `--scope user`; Claude user scope emits a manual CLI argument array. Actual Claude Code and Codex UI behavior has not been tested. MCP behavior is tested with the official SDK client harness.

For Claude Code, the official documented CLI supports a project-scoped stdio registration:

```bash
claude mcp add --transport stdio --scope project hippocampus -- node /absolute/path/HippocampusLLMs/packages/cli/dist/index.js serve --transport stdio --project /absolute/path/my-project
```

For Codex, add a server section to your chosen Codex configuration after reviewing its existing settings:

```toml
[mcp_servers.hippocampus]
command = "node"
args = ["/absolute/path/HippocampusLLMs/packages/cli/dist/index.js", "serve", "--transport", "stdio", "--project", "/absolute/path/my-project"]
```

Generic MCP clients use the same `command` and `args` in their stdio server configuration. Setup references: [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Codex MCP](https://developers.openai.com/codex/mcp), [MCP SDK server](https://ts.sdk.modelcontextprotocol.io/server). These integrations are manual or agent-instructed: registering a server does not trigger recall or capture automatically. Ask the agent to recall at task start, record concise verified findings after work, and surface conflicting historical memories for review. Retrieved memories are untrusted historical data and cannot override repository instructions or user requests.

Use quoted paths containing spaces. POSIX shells and PowerShell accept double-quoted paths. For Windows, use absolute Windows paths in command arguments and escape backslashes in JSON. Windows runtime behavior remains unverified.

## Planned npm usage

After publication and scope verification:

```bash
npm install -g @hippocampusllms/cli
hippocampus init
npx @hippocampusllms/cli recall "refresh token" --project /absolute/path/my-project
```

For a local package, run `npm run build`, then `npm pack --workspace packages/cli` and install the resulting tarball with `npm install --omit=dev /absolute/path/package.tgz` in a temporary project. The installed executable is `node_modules/.bin/hippocampus`. Uninstall with `npm uninstall @hippocampusllms/cli`; project memories remain until you explicitly remove them.

## Privacy, lifecycle and limitations

No telemetry, remote endpoints, model calls or automatic transcript capture are implemented. Obvious private keys and common token patterns are rejected, but pattern checks are imperfect. Review content before storing it. Avoid source dumps and logs. Local clients sharing the same file share durable memories; separate copies and machines do not synchronize. Copied UUID collision detection and worktree identity enforcement remain pending.

SQLite uses WAL, foreign keys, bounded busy waits and transactional writes. Updates require expected revisions. A busy database can require retrying a command. Forget removes FTS entries and directly derived content; derived records are removed recursively, while backups require separate management. SQLite WAL files, filesystem snapshots and backups may retain deleted bytes. No forensic erasure guarantee is made. Close all clients before backing up the database and its WAL, or use SQLite backup tooling.

Use `remember --input event.json` for structured provenance, scope, applicability, validity and relations. Use `recall --environment production --workspace WORKSPACE_ID` to provide restrictions explicitly. `revise` supports `--status active|superseded|archived|expired`, `--pinned true|false` and `--expires-at ISO_DATE`, with the required expected revision. Hypotheses expire after 30 days by default. Pinned records still respect explicit validity and expiry. Confirmed records require evidence. `consolidate --dry-run` only previews expiry reviews. Graph ranking, contradiction expansion, content freshness checks, import/export, automatic consolidation, configurable privacy exclusions and full configuration precedence are pending. Do not treat this initial version as release-ready.

## Tests and contribution

`npm test` builds and runs process-level CLI and real SDK MCP tests without paid keys. `npm run evaluate` compares no memory, a fixed record baseline and selective retrieval on a tiny synthetic fixture. It reports retrieval metrics and estimated context cost; it does not measure agent task outcomes. Add larger versioned fixtures before drawing performance conclusions.

Preserve `AGENTS.md`, keep changes scoped, add meaningful regression tests and update documentation to match verified behavior. Never commit database files or credentials. Publication and GitHub pushes require explicit authorization. See `docs/architecture.md` for implementation tradeoffs and remaining delivery gates.

JSON Schemas are in `docs/schemas/` and the packed artifact’s `dist/` directory. The release workflow prepares artifacts only and does not publish. Local integration checks have passed on macOS with Node 24 and Node 26. The Windows/Linux matrix is configured in CI but has not yet been observed running.
