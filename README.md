# HippocampusLLMs

HippocampusLLMs gives coding agents a small, durable memory for each project. Record decisions, constraints, corrections and verified findings once, then recall the relevant ones in a later session. Memories stay in a local SQLite database and can be shared by agents using the command line or MCP.

It stores concise records with rationale and evidence references. It does not save entire conversations, send telemetry or require a model API key. Recall uses SQLite FTS5 lexical search and an estimated context budget. The agent decides when to call the recall and capture tools.

## Run the project

Requires Node.js 24 LTS or newer and npm.

```bash
git clone https://github.com/cityofai-dev/HippocampusLLMs.git
cd HippocampusLLMs
npm ci
npm run build
npm link --workspace packages/cli
hippocampus help
```

The local link makes `hippocampus` available in your terminal. If you prefer to run it without a link, use `node /absolute/path/HippocampusLLMs/packages/cli/dist/index.js` in place of `hippocampus` below.

## Use it in a project

Open the project you want to remember and initialize it:

```bash
cd /absolute/path/my-project
hippocampus init
```

This creates `.hippocampus/config.json` with a stable project ID and `.hippocampus/memory.sqlite` for local records. Running `init` again keeps the same identity. The database and its WAL files are ignored by Git.

Record a decision:

```bash
hippocampus remember --kind decision --content "Refresh token rotation requires a database transaction" --source "Project decision"
```

In another terminal or agent session, recall it:

```bash
cd /absolute/path/my-project
hippocampus recall "refresh token rotation" --budget 1500 --json
```

The response includes a memory ID. Use that ID to inspect, correct or remove the record:

```bash
hippocampus inspect MEMORY_ID --json
hippocampus revise MEMORY_ID --content "Refresh token rotation requires a serializable transaction" --expected-revision 1
hippocampus forget MEMORY_ID
```

`revise` requires the current revision shown by `inspect`. If another agent updated the record first, the command returns `REVISION_CONFLICT` instead of overwriting it. Commands return JSON; errors go to stderr. Add `--project /absolute/path/my-project` when running a command from another directory.

Useful commands:

| Command                                                         | What it does                                        |
| --------------------------------------------------------------- | --------------------------------------------------- |
| `hippocampus memories --json`                                   | List project memories                               |
| `hippocampus inspect ID --json`                                 | Show a complete record and its evidence             |
| `hippocampus revise ID --status archived --expected-revision N` | Archive a record                                    |
| `hippocampus forget ID`                                         | Delete a record and content-bearing derived records |
| `hippocampus doctor`                                            | Show project and provider information               |

Memory kinds are `decision`, `constraint`, `episode`, `procedure`, `correction` and `task`.

## Configuration

Run `hippocampus config` in an initialized project for an interactive wizard. It previews changes before saving. For scripts or non-interactive terminals, use:

```bash
hippocampus config show --json
hippocampus config get storage.provider
hippocampus config set retrieval.maxContextTokens 1200
hippocampus config validate
hippocampus config test
```

A default project configuration looks like this; `init` generates the UUID for you:

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

The database path is relative to `.hippocampus/config.json`. Invalid or unsupported settings are rejected before the file is replaced. Changing the path of a nonempty store is blocked because automatic store migration is not implemented. User defaults are available with `hippocampus config --scope user`; project settings take precedence.

SQLite is the **canonical memory store**. FTS5 is the **retrieval index**. Vector search, embeddings and PostgreSQL are planned providers and cannot be selected in this version.

## Connect a coding agent

Initialize the target project, then preview and install its MCP connection:

```bash
hippocampus connect claude --dry-run
hippocampus connect claude
```

For Codex, use `connect codex` instead. The adapters preserve unrelated settings and create a backup. `hippocampus disconnect claude` or `hippocampus disconnect codex` removes settings managed by HippocampusLLMs.

Ask the agent to use memory when it helps the task:

> Recall relevant project memories before changing the refresh-token code. After verifying a useful decision or fix, record a concise memory with its source. Show me any conflicting memories before relying on them.

Connecting MCP does not automatically capture conversations or trigger recall. The six tools are `hippocampus_recall`, `hippocampus_remember`, `hippocampus_inspect`, `hippocampus_revise`, `hippocampus_forget` and `hippocampus_feedback`. They use the same project database as the CLI.

Other MCP clients can launch the stdio server with an explicit absolute project path:

```text
command: node
args: /absolute/path/HippocampusLLMs/packages/cli/dist/index.js serve --transport stdio --project /absolute/path/my-project
```

Use your client's argument-array format for `args`, and quote paths containing spaces. The server reserves stdout for MCP messages. Restart it after changing project configuration. Live Claude Code and Codex sessions have not yet been verified; the MCP server has been tested with independent SDK clients.

## Structured records and relevance

For evidence and scope, save a small JSON event:

```json
{
  "kind": "constraint",
  "content": "Production refresh token rotation requires a serializable transaction",
  "rationale": "Concurrent refresh requests must not consume the same token twice.",
  "verification": "observed",
  "evidence": [
    { "type": "test", "reference": "tests/auth/refresh-rotation.test.ts" }
  ],
  "applicability": { "environments": ["production"] }
}
```

```bash
hippocampus remember --input event.json
hippocampus recall "refresh token concurrency" --environment production
```

A record restricted to an environment, workspace or component is excluded when recall lacks the matching context. Hypotheses expire after 30 days by default; confirmed records require evidence references. Recall does not recheck evidence or turn a hypothesis into a confirmed fact. Use `inspect` and `revise` to maintain records as the project changes.

## Privacy and current limits

Memories are local to the project's database. Separate machines do not synchronize automatically. Obvious credentials and private-key patterns are rejected, but filters are imperfect, so review content before storing it. Retrieved memories are historical data, not instructions to execute.

Forgetting removes records and their FTS entries, but database WAL files, backups or filesystem snapshots may retain old bytes. Export/import, automatic store migration, semantic consolidation and evidence freshness checks are not implemented. Recall is lexical; vector and embedding providers are not active.

If a command says the project is not initialized, run `hippocampus init` in the target project. If recall returns no results, check the query, expiry, status and required context. If the database is busy, retry after the other writer finishes.

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run evaluate
```

The test suite covers persistence across processes, recall relevance, project isolation, budgets, configuration, concurrent revisions, deletion, adapters and MCP clients. It needs no paid API keys. The small synthetic evaluation compares selective recall with fixed instructions and no memory; it does not measure end-to-end agent performance.

The source is organized under `packages/core`, `packages/storage-sqlite`, `packages/mcp`, `packages/cli` and `packages/adapters`. See the repository's `docs/` directory for the memory model, JSON Schemas and architecture decisions. Follow `AGENTS.md` when contributing.

## License

MIT.
