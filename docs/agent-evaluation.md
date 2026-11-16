# Cross-client demonstration and task evaluation

```bash
npm run demo:cross-agent
npm run evaluate
npm run evaluate:agents
```

The demonstration creates temporary project/config/runtime artifacts and runs two independent SDK clients using the generated Claude and Codex MCP launch definitions. It checks a synthetic Node fixture, captures the result, recalls in a fresh client, changes and rechecks the fixture, detects evidence drift, previews and accepts a correction, then observes that correction from another session and forgets it. `npm test` executes this sequence. These are scripted transport sessions, not model-driven Claude/Codex tool selection. Temporary demonstration projects are retained for inspection; they contain synthetic data only.

The deterministic retrieval evaluation compares no memory, all fixed fixture instructions, lexical, hybrid and local-token-vector retrieval on the same 24 tasks. Each retrieval strategy now sets and asserts its effective configuration before running queries. Earlier reports showing all three modes tied came from the erroneous vector-only execution and are superseded by the corrected results in [validation](validation.md).

## Optional real-agent benchmark

`tests/fixtures/agent-tasks.json` contains a small synthetic version-sensitive retry task, a starter module, historical constraints, relevance labels, hidden behavioral cases and a designated repeated-failure case. All three strategies get the same task and starter. Only injected historical context differs. The fixed-instruction baseline injects all records, including superseded history. Selective recall filters and budgets the context before injection. This measures an explicit context-injection experiment; it does not measure whether an agent autonomously calls MCP tools.

By default, the benchmark builds isolated temporary workspaces and reports retrieval metrics with null task outcomes. It invokes no model. To run actual Codex models with the user's configured authentication:

```bash
npm run evaluate:agents -- --run-model --model YOUR_MODEL_ID --provider openai
```

This explicitly runs three model sessions for the single fixture and sends the synthetic task/context to the selected provider. It uses the local Codex CLI in ephemeral `workspace-write` mode with user configuration ignored, an explicit model/provider and a three-minute timeout per session. It does not bypass sandbox/approval controls. Only synthetic memories are supplied; no project memory is read. A missing model/provider or client failure is not a successful outcome.

The runner tests the resulting `policy.mjs` against a verifier outside the task workspace and reports task pass/fail, repeated-failure count, model/provider, client version, token usage when reported, context estimate, retrieval latency and agent latency. It keeps temporary source workspaces for inspection and does not persist full agent transcripts. The task verifier executes generated JavaScript in a bounded child process. Additional provider definitions need explicit Codex configuration support; only the built-in OpenAI provider path is documented here.

No live model benchmark was run during implementation. One fixture is a smoke experiment, not evidence of general task-performance gains. Expand tasks and repeat trials before making quality claims. Default CI requires no paid API keys and verifies the dry-run path plus retrieval-mode assertions.
