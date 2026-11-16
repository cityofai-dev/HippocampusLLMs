# HippocampusLLMs

**Remember what matters. Recall what applies.**

HippocampusLLMs is local project memory for coding agents. Save a decision, constraint, correction or verified finding once; retrieve it when a later task needs it. Memories live in your project's SQLite database and are available through the `hippocampus` command and a stdio MCP server.

[Quickstart](#quickstart) · [Features](#features) · [Connectors](#connectors) · [Configuration](#configuration) · [Commands](#command-reference)

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

## Features

- **Project-scoped memory:** SQLite stores concise decisions, constraints, corrections, episodes and procedures with provenance, applicability and revisions. Separate local clients can share one initialized project's database.
- **Selective recall:** SQLite FTS5 lexical search is the default. Optional offline local token vectors support vector and hybrid modes. Results obey project, environment, workspace and component restrictions and an estimated output budget; unrelated queries may return nothing.
- **Review before acceptance:** Agents can propose a new memory or a correction. Pending proposals stay out of recall until explicitly accepted, and corrections reject stale target revisions.
- **Evidence and explanations:** Supported project-relative file evidence gets a content hash at capture. `inspect` and the inbox flag changed or missing files; `recall --explain` reports bounded ranking and exclusion reasons. A changed file asks for review rather than proving the memory wrong.
- **Local interoperability:** The CLI and stdio MCP server use the same memory services. Claude Code and Codex can connect through direct MCP settings or generated local plugins; Hermes can connect over MCP or use the separate native provider.

Capture is explicit by default. No transcripts are stored automatically, and there is no model extraction, telemetry or remote service in the local setup.

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

## Connectors

Initialize the target project before connecting a client. Every launch must include its **absolute** `--project` path, including when the project path contains spaces. A connector exposes the same local database; it does not synchronize machines or grant automatic access to conversation transcripts.

| Client            | Connection options                                                         | Recall and capture trigger                                                                                                          | Verified scope                                                                                                      |
| ----------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Claude Code       | Project MCP settings via `connect claude`, or a generated local plugin     | Manual or agent-instructed; the plugin includes a memory skill                                                                      | MCP health check and plugin manifest validation on macOS                                                            |
| Codex             | Project/user MCP settings via `connect codex`, or a generated local plugin | Manual or agent-instructed; the plugin includes a memory skill                                                                      | MCP entry recognized and plugin installed in isolated configuration on macOS; live model-driven tool use unverified |
| Hermes            | Profile MCP server, or the separate native memory provider                 | MCP is manual or agent-instructed; native provider prefetches bounded recall for incoming queries and offers explicit capture tools | Native provider and MCP smoke checks on a local Hermes installation                                                 |
| Other MCP clients | Configure the stdio command and argument array below                       | Client-dependent; no automatic trigger is assumed                                                                                   | Two independent MCP SDK sessions exercised; other hosts unverified                                                  |
| CLI-only agents   | Invoke `hippocampus ... --json` or `hippocampus call TOOL --input FILE`    | Agent-instructed                                                                                                                    | Same local application services                                                                                     |

### Claude Code and Codex: direct MCP connection

Preview the exact configuration change, then connect the desired host:

```bash
npx --no-install hippocampus connect claude --project "/absolute/path/my-project" --dry-run
npx --no-install hippocampus connect claude --project "/absolute/path/my-project"
npx --no-install hippocampus connect codex --project "/absolute/path/my-project" --dry-run
npx --no-install hippocampus connect codex --project "/absolute/path/my-project"
```

Project scope writes Claude's `.mcp.json` or Codex's `.codex/config.toml` in the target project. Unrelated entries are preserved and an existing settings file gets a `.hippocampus.bak` backup. The adapter refuses an existing `hippocampus` entry it does not own. Restart the client after connecting. To remove owned settings, run `npx --no-install hippocampus disconnect claude --project "/absolute/path/my-project"` or substitute `codex`; memories remain in the project database. `--scope user` is explicit: Codex can write its user config, while Claude returns a manual `claude mcp add` argument array to review and run yourself.

### Claude Code and Codex: local plugin packages

Plugins add a small memory skill alongside the MCP server. Building a plugin creates files only; it does not install the plugin into a client. Build one host at a time and inspect the returned installation command:

```bash
npx --no-install hippocampus plugin build claude --project "/absolute/path/my-project" --dry-run
npx --no-install hippocampus plugin build claude --project "/absolute/path/my-project"
claude --plugin-dir "/absolute/path/my-project/.hippocampus/plugins/claude"

npx --no-install hippocampus plugin build codex --project "/absolute/path/my-project" --dry-run
npx --no-install hippocampus plugin build codex --project "/absolute/path/my-project"
codex plugin marketplace add "/absolute/path/my-project/.hippocampus/plugins/codex"
codex plugin add hippocampus@hippocampus-local
```

The generated runtime is snapshotted under the target project's ignored `.hippocampus/plugin-runtimes/`, so it does not depend on the source checkout. Keep the project path and recorded Node executable available. The Claude `--plugin-dir` flag applies to that invocation; Codex plugin installation changes its client configuration. Disconnect the client first, then preview `npx --no-install hippocampus plugin remove HOST --project "/absolute/path/my-project" --dry-run` before removing owned artifacts. See [plugin setup, removal and tested versions](docs/integrations-plugins.md). Use either the plugin or the direct MCP connection for one host/project to avoid duplicate tool surfaces.

### Hermes: MCP or native memory provider

For MCP, add a `hippocampus` entry to the active Hermes profile's `mcp_servers` and restart Hermes. For native integration, copy `plugins/hermes` into that profile's `$HERMES_HOME/plugins/hippocampus/`, configure an absolute project and CLI path, then select `memory.provider: hippocampus`. The native provider prefetches at most 1200 estimated tokens for incoming queries and exposes explicit memory tools; it does not mirror Hermes transcripts or built-in personal memory files. These are separate choices. The [Hermes guide](docs/integrations-plugins.md#hermes-mcp-connection) gives exact YAML/JSON examples and removal steps.

### Generic MCP and CLI fallback

Configure a stdio client using separate argument strings (the executable path below assumes a project-local npm installation):

```json
{
  "command": "/absolute/path/to/node",
  "args": [
    "/absolute/path/my-project/node_modules/@hippocampusllms/cli/dist/index.js",
    "serve",
    "--transport",
    "stdio",
    "--project",
    "/absolute/path/my-project"
  ]
}
```

The server uses stdout for MCP protocol traffic and reports diagnostics on stderr. Restart it after project configuration changes. It exposes nine tools: `hippocampus_recall`, `hippocampus_remember`, `hippocampus_inspect`, `hippocampus_revise`, `hippocampus_forget`, `hippocampus_feedback`, `hippocampus_propose`, `hippocampus_inbox` and `hippocampus_review`. CLI-only clients can use `remember`, `recall --json` and the `tools`/`call` JSON interface.

Tell an agent when to use memory, for example:

> Recall project memories relevant to this task before changing the refresh-token code. After verifying a durable decision or fix, record it with its source. Show me conflicting memories before relying on them.

An MCP connection makes tools available; it does not guarantee the agent will call them. No Claude/Codex task hooks or automatic transcript capture are installed.

## Review, evidence and explainable recall

An agent can submit a structured candidate for review. Save this as `proposal.json`:

```json
{
  "memory": {
    "kind": "decision",
    "content": "Refresh retry policy allows two attempts on HTTP 429",
    "rationale": "More retries can amplify a rate limit",
    "verification": "observed",
    "evidence": [{ "type": "path", "reference": "src/auth/retry.ts" }]
  }
}
```

```bash
npx --no-install hippocampus propose --input proposal.json
npx --no-install hippocampus inbox
npx --no-install hippocampus review inspect PROPOSAL_ID
npx --no-install hippocampus review accept PROPOSAL_ID --expected-revision 1
npx --no-install hippocampus recall "refresh retry policy" --explain --budget 1500
```

Pending proposals do not enter recall. `review reject PROPOSAL_ID --expected-revision 1` discards one. To propose a correction, include `targetId` and its `expectedRevision` beside `memory`; acceptance checks both the proposal revision and the target's revision in one transaction. The inbox also reports changed or missing path evidence and direct contradiction links. Explain mode shows bounded relevance and filtering reasons without copying excluded contents into diagnostics. [Review and recall details](docs/review-and-recall.md) cover supported evidence, preview commands and limits.

Run `npm run demo:cross-agent` from source for a scripted capture, fresh-session recall, evidence drift, correction and forgetting example. It uses two independent MCP SDK sessions; model-driven host behavior is not claimed. `npm run evaluate:agents` previews the no-memory/fixed-instruction/selective-recall task benchmark without model calls. [Evaluation instructions](docs/agent-evaluation.md) describe opting into actual Codex model runs.

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

The canonical store owns records and revisions. A retrieval index selects records; it is not the authoritative store. Local vectors are 256-dimensional hashed token counts with cosine similarity. They run offline and are **not semantic language-model embeddings**. Hybrid mode combines lexical and vector candidates by reciprocal rank. A shared-token relevance guard filters weak matches and hash collisions. On the corrected 24-task synthetic evaluation, lexical and hybrid modes reach 0.864 recall versus 0.818 for local token vectors; local token vectors have not shown a quality improvement. Qdrant, pgvector, PostgreSQL and semantic embedding providers are planned and cannot be selected.

## Command reference

| Command                                  | Purpose                                             |
| ---------------------------------------- | --------------------------------------------------- |
| `init`                                   | Initialize project identity, config and database    |
| `config`                                 | Preview and edit project configuration              |
| `config show/get/set/validate/test`      | Manage configuration without the wizard             |
| `remember`                               | Record a concise project memory                     |
| `recall`                                 | Retrieve relevant memories within a budget          |
| `memories --json`                        | List project records                                |
| `inspect ID --json`                      | Show a complete record and evidence freshness       |
| `revise ID --expected-revision N`        | Correct content or lifecycle metadata               |
| `forget ID`                              | Remove a record and content-bearing derived records |
| `doctor`                                 | Show project and provider information               |
| `connect` / `disconnect`                 | Manage Claude Code or Codex project settings        |
| `serve --transport stdio --project PATH` | Serve the same project through MCP                  |
| `consolidate --dry-run`                  | Preview expiry reviews                              |
| `plugin build/remove HOST`               | Build or remove owned Claude/Codex plugin artifacts |
| `propose --input FILE` / `inbox`         | Submit and list reviewable memory candidates        |
| `review inspect/accept/reject ID`        | Preview, accept or reject a proposal                |

All commands return JSON results, with diagnostics on stderr. Use `--status archived` with `revise` to hide an inactive memory from normal recall. The supported statuses are `active`, `superseded`, `archived` and `expired`.

## Privacy and current limits

Memory files stay local. No telemetry, remote memory provider, model extraction or automatic transcript capture is enabled. Obvious credential patterns are rejected, but pattern checks are imperfect; review content before storing it. Treat recalled content as historical data, not an instruction to execute.

`forget` removes the record, its FTS entry and content-bearing derived records. SQLite WAL files, backups or filesystem snapshots may retain old bytes. Export/import, automatic store migration, and semantic consolidation are not implemented. Relative path evidence under 1 MiB is snapshotted and checked for changes; commit, symbol and external evidence verification remain unsupported. Recall uses the selected lexical, local vector or hybrid mode and a conservative estimate of serialized output size, not a model tokenizer. Local token vectors mainly match shared terms and can collide; they do not understand meaning. See [the validation record](docs/validation.md) for the synthetic evaluation results and platform verification status.

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
