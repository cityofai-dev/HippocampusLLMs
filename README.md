# HippocampusLLMs

**Remember what matters. Recall what applies.**

HippocampusLLMs is local project memory for coding agents. Save a decision, constraint, correction or verified finding once; retrieve it when a later task needs it. Memories live in your project's SQLite database and are available through the `hippocampus` command and a stdio MCP server.

[Quickstart](#quickstart) · [How it works](#how-it-works) · [Connect an agent](#connect-an-agent) · [Configuration](#configuration) · [Commands](#command-reference)

## Quickstart

Requires **Node.js 24 LTS or newer**. Install the package in a project and initialize its memory:

```bash
cd /absolute/path/my-project
npm i @hippocampusllms/cli
npx --no-install hippocampus init
```

Record a decision:

```bash
npx --no-install hippocampus remember \
  --kind decision \
  --content "Refresh token rotation requires a database transaction" \
  --source "Project decision"
```

In another terminal or agent session, recall it:

```bash
cd /absolute/path/my-project
npx --no-install hippocampus recall "refresh token rotation" --budget 1500 --json
```

The result includes the memory's ID, content, verification state and provenance. Use the ID to inspect, correct or remove it:

```bash
npx --no-install hippocampus inspect MEMORY_ID --json
npx --no-install hippocampus revise MEMORY_ID \
  --content "Refresh token rotation requires a serializable transaction" \
  --expected-revision 1
npx --no-install hippocampus forget MEMORY_ID
```

The examples use a project-local installation. If you linked the package globally from source, use `hippocampus` in place of `npx --no-install hippocampus`. Add `--project /absolute/path/my-project` when running a command outside the project directory.

## Why use project memory?

Coding sessions end, but decisions and constraints often outlive them. A useful memory states the conclusion, why it matters and where it came from. HippocampusLLMs stores that small record and selects relevant records for the current task within a context budget.

| When you need to…                           | Use…                                     |
| ------------------------------------------- | ---------------------------------------- |
| Preserve a design choice and its rationale  | `remember --kind decision`               |
| Keep an explicit project rule available     | `remember --kind constraint`             |
| Record a correction after finding a mistake | `remember --kind correction`             |
| Retrieve context for a new task             | `recall "task description"`              |
| Check the basis of a memory                 | `inspect MEMORY_ID`                      |
| Replace stale content safely                | `revise MEMORY_ID --expected-revision N` |
| Remove content you no longer want stored    | `forget MEMORY_ID`                       |

The system captures **explicitly**. It does not save transcripts, run a model to extract memories, or change model weights.

## How it works

1. `init` creates `.hippocampus/config.json` with a stable project UUID and a local `.hippocampus/memory.sqlite` database. Repeating `init` preserves that identity.
2. `remember` validates a concise record and saves its content, provenance, applicability and revision.
3. `recall` searches the configured lexical, local vector or hybrid index, filters records that do not apply, and returns compact results within an estimated token budget. An unrelated query can return an empty result.
4. `inspect`, `revise` and `forget` maintain those records. Revision checks prevent stale updates from silently overwriting another agent's work.

Several local clients pointed at the same project use the same database. Separate machines or copied projects do not synchronize automatically.

### A richer memory

Use a JSON event when a memory needs rationale, evidence or an environment restriction. Save this as `event.json`:

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
npx --no-install hippocampus remember --input event.json
npx --no-install hippocampus recall "refresh token concurrency" --environment production
```

A restricted memory is excluded when recall lacks the matching environment, workspace or component. A confirmed memory requires evidence references. Recall does not recheck evidence or promote a hypothesis to confirmed status. Hypotheses expire after 30 days unless given an explicit expiry.

## Connect an agent

Initialize the project first. Then preview and install a project MCP connection:

```bash
npx --no-install hippocampus connect claude --dry-run
npx --no-install hippocampus connect claude
```

For Codex, replace `claude` with `codex`. These adapters preserve unrelated client settings, make a backup and can remove the settings they own with `hippocampus disconnect claude` or `hippocampus disconnect codex`.

Tell the agent when to use memory, for example:

> Recall project memories relevant to this task before changing the refresh-token code. After verifying a durable decision or fix, record it with its source. Show me conflicting memories before relying on them.

**Connecting MCP makes tools available; it does not trigger capture or recall on its own.** Claude Code's isolated user-scoped configuration has passed a live stdio health check. Codex's isolated configuration is recognized as enabled; its list command does not invoke the server, so a live Codex tool call remains unverified. The server has also been exercised with two independent MCP SDK clients.

The server offers six tools: `hippocampus_recall`, `hippocampus_remember`, `hippocampus_inspect`, `hippocampus_revise`, `hippocampus_forget` and `hippocampus_feedback`. Clients without MCP can call the same services through CLI JSON output.

For another MCP client, configure a stdio launch command with an **absolute project path**:

```text
command: node
args: /absolute/path/HippocampusLLMs/packages/cli/dist/index.js serve --transport stdio --project /absolute/path/my-project
```

Express `args` as separate strings in your client's configuration. The server never relies on the client's working directory. Restart it after changing project configuration.

## Configuration

Run `npx --no-install hippocampus config` inside an initialized project to open the wizard. Choose SQLite lexical, SQLite hybrid or SQLite vector retrieval from its numbered menu. It previews changes before saving and requires an interactive terminal. For scripts:

```bash
npx --no-install hippocampus config show --json
npx --no-install hippocampus config get storage.provider
npx --no-install hippocampus config set retrieval.maxContextTokens 1200
npx --no-install hippocampus config preset hybrid
npx --no-install hippocampus config preset vector
npx --no-install hippocampus config validate
npx --no-install hippocampus config test
```

`init` writes a valid configuration like this; the project UUID is generated for your project:

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

To select local hybrid retrieval, use `config preset hybrid`. Its relevant settings are:

```json
{
  "retrieval": {
    "mode": "hybrid",
    "maxContextTokens": 1500,
    "vector": {
      "provider": "sqlite",
      "dimensions": 256,
      "model": "token-hash-v1"
    }
  },
  "embeddings": {
    "provider": "local-hash",
    "dimensions": 256,
    "model": "token-hash-v1"
  }
}
```

The database path resolves relative to `.hippocampus/config.json`. Configuration changes are validated before an atomic replacement. A nonempty database blocks a canonical store path change because automatic store migration is not implemented. Switching retrieval modes preserves memories and builds missing local vectors from the canonical records. User defaults are available through `config --scope user`; project settings take precedence.

| Provider role           | Available now          | Planned                  |
| ----------------------- | ---------------------- | ------------------------ |
| Canonical memory store  | SQLite (`node:sqlite`) | PostgreSQL               |
| Lexical retrieval index | SQLite FTS5            | —                        |
| Vector index            | SQLite local vectors   | Qdrant, pgvector         |
| Embeddings              | Local token hashing    | Semantic model providers |

The canonical store owns records and revisions. A retrieval index selects records; it is not the authoritative store. Local vectors are 256-dimensional hashed token counts with cosine similarity. They run offline and are **not semantic language-model embeddings**. Hybrid mode combines lexical and vector candidates by reciprocal rank. A shared-token relevance guard filters weak matches and hash collisions. On the current 24-task synthetic evaluation, lexical, hybrid and local token-vector modes tie; none recall the paraphrase cases, so these vectors have not shown a quality improvement on that set. Qdrant, pgvector, PostgreSQL and semantic embedding providers are planned and cannot be selected.

## Command reference

| Command                                  | Purpose                                                               |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `init`                                   | Initialize project identity, config and database                      |
| `config`                                 | Preview and edit project configuration                                |
| `config show/get/set/validate/test`      | Manage configuration without the wizard                               |
| `remember`                               | Record a decision, constraint, episode, procedure, correction or task |
| `recall`                                 | Retrieve relevant memories within a budget                            |
| `memories --json`                        | List project records                                                  |
| `inspect ID --json`                      | Show a complete record                                                |
| `revise ID --expected-revision N`        | Change content, status, pin or expiry                                 |
| `forget ID`                              | Remove a record and content-bearing derived records                   |
| `doctor`                                 | Show project and provider information                                 |
| `connect` / `disconnect`                 | Manage Claude Code or Codex project settings                          |
| `serve --transport stdio --project PATH` | Serve the same project through MCP                                    |
| `consolidate --dry-run`                  | Preview expiry reviews                                                |

All commands return JSON results, with diagnostics on stderr. Use `--status archived` with `revise` to hide an inactive memory from normal recall. The supported statuses are `active`, `superseded`, `archived` and `expired`.

## Privacy and current limits

Memory files stay local. No telemetry, remote memory provider, model extraction or automatic transcript capture is enabled. Obvious credential patterns are rejected, but pattern checks are imperfect; review content before storing it. Treat recalled content as historical data, not an instruction to execute.

`forget` removes the record, its FTS entry and content-bearing derived records. SQLite WAL files, backups or filesystem snapshots may retain old bytes. Export/import, automatic store migration, semantic consolidation and evidence freshness checks are not implemented. Recall uses the selected lexical, local vector or hybrid mode and a conservative estimate of serialized output size, not a model tokenizer. Local token vectors mainly match shared terms and can collide; they do not understand meaning. See [the validation record](docs/validation.md) for the synthetic evaluation results and platform verification status.

If a command says the project is not initialized, run `init` in the target project. If recall is empty, check the query, status, expiry and required applicability context. If an update returns `REVISION_CONFLICT`, inspect the latest revision before retrying.

## Develop from source

```bash
git clone https://github.com/cityofai-dev/HippocampusLLMs.git
cd HippocampusLLMs
npm ci
npm run build
npm test
npm run lint
npm run evaluate
npm link --workspace packages/cli
```

The source is divided into `packages/core`, `packages/storage-sqlite`, `packages/mcp`, `packages/cli` and `packages/adapters`. Tests cover cross-process persistence, isolation, revisions, budgets, configuration, deletion, adapters and MCP. The synthetic evaluation compares selective recall, fixed instructions and no memory; it does not measure end-to-end agent outcomes. See `docs/` for architecture, the memory model and JSON Schemas. Follow `AGENTS.md` when contributing.

## License

MIT.
