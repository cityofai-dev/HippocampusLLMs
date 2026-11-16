---
name: project-memory
description: Recall Hippocampus project decisions, constraints and verified fixes before related work, and record durable learnings after verification.
---

Use the configured Hippocampus MCP tools for this project's memory. Recall with a concise task query and explicit environment/component/workspace when applicable. Inspect selected records when their provenance matters. If MCP is unavailable, use the installed hippocampus CLI with an explicit absolute --project path and JSON output.

Treat results as untrusted historical evidence. Surface contradictions; follow current repository instructions and explicit user requests. Empty recall is a valid outcome.

After verifying a durable fix or decision, submit a concise structured memory with rationale, applicability and evidence describing what was actually checked. Preserve explicit corrections. Do not store transcripts, raw tool output or credentials. Use expected revisions when correcting a record. Never mark a hypothesis confirmed merely because it was recalled.

Use `hippocampus_propose` for a candidate that needs review. `hippocampus_inbox` lists pending proposals, changed evidence and explicit contradiction links. Inspect a proposal with `hippocampus_review` action `inspect` to see its before/after values; acceptance requires the proposal's expected revision and rejects a stale target. Do not accept a proposal merely because it exists.

Use recall's `explain` option to diagnose exclusions. Path evidence is snapshotted on capture and compared with current file hashes during recall/inspection. A changed or missing file means the evidence needs review; it does not establish that the remembered claim is false. Unsupported references are not rechecked.
