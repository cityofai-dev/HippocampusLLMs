# Review, explanations and evidence freshness

A proposal is a versioned, project-isolated draft in SQLite schema migration 3. It is not a canonical memory, is not indexed and cannot appear in recall until accepted. Proposal creation uses the same memory schema, size/credential checks and evidence snapshotter as explicit capture.

## Propose, inspect and accept

Save this as `proposal.json`:

```json
{
  "memory": {
    "kind": "decision",
    "content": "Refresh retry policy allows two attempts on HTTP 429",
    "rationale": "Repeated authentication retries can amplify a rate limit",
    "verification": "observed",
    "evidence": [{ "type": "path", "reference": "src/auth/retry.ts" }],
    "applicability": { "environments": ["production"] }
  }
}
```

```bash
hippocampus propose --input proposal.json
hippocampus inbox
hippocampus review inspect PROPOSAL_ID
hippocampus review accept PROPOSAL_ID --expected-revision 1 --dry-run
hippocampus review accept PROPOSAL_ID --expected-revision 1
```

For a correction, additionally include `targetId` and its `expectedRevision` beside `memory`. The preview shows before/after values and whether the target changed. Omitted correction fields retain their existing values; `kind` must match. Proposal revision 1 and the target memory's expected revision are distinct checks. Acceptance applies the memory mutation and removes the draft in one transaction; a stale target leaves the draft pending and returns `REVISION_CONFLICT`. Submit a new proposal after inspecting the latest target. Acceptance does not infer confirmation, broaden applicability or refresh existing evidence hashes.

Use `review reject PROPOSAL_ID --expected-revision 1` to remove a pending candidate. This retains no content-bearing rejection history. Forgetting a memory also removes proposals targeting it or deriving from it. SQLite WAL/backup erasure limitations still apply. Acceptance/removal retries return `NOT_FOUND` once the draft is gone; they do not apply a second mutation.

The MCP/native equivalents are `hippocampus_propose`, `hippocampus_inbox` and `hippocampus_review` with action `inspect`, `accept` or `reject`. Inspection is separate from explicit acceptance; installing a plugin authorizes neither acceptance nor automatic capture.

## Evidence freshness

Capture snapshots SHA-256 hashes for supported `type: path` evidence without supplied hashes. References must be project-relative paths to regular files up to 1 MiB; references outside the canonical root and symlinks escaping it are not read. Hashing records the file state at capture, not proof of the remembered conclusion. Retain a test reference or explicit decision explaining what was checked.

Inspect and recall return evidence states:

| State         | Meaning                                                  |
| ------------- | -------------------------------------------------------- |
| `current`     | File matches the stored snapshot                         |
| `changed`     | File bytes differ; review applicability                  |
| `missing`     | File unavailable; no conclusion about the memory's truth |
| `untracked`   | Legacy evidence has no stored hash                       |
| `unsupported` | Reference type/path/size is not supported for checking   |

Changed and missing evidence appear as computed inbox review items. They do not mutate records or automatically archive memories. Corrected evidence must be explicitly supplied through revision or a reviewed proposal. Commit IDs, path-and-symbol expressions, test/issue/user references and remote resources are not executed or reverified. The pending queue rejects additions after 1000 proposals until items are reviewed. Its versioned schema is generated at `schemas/proposal.schema.json`. The inbox examines up to 1000 project records/proposals and returns at most 100 evidence-review items and contradiction links.

## Explain recall

```bash
hippocampus recall "refresh retry policy" --explain --budget 1500 --environment production
```

The response includes at most 25 candidate explanations: selected status, exclusion reason, exact shared-term count, minimum overlap, reciprocal-rank contribution and retrieval sources. Reasons include component/workspace/environment mismatch, inactive/expired/not-yet-valid, insufficient relevance and context budget. Only this project's candidate IDs are included; excluded contents are not copied into diagnostics. Candidate generation is capped at 100 per retrieval source; explanations do not enumerate the entire database.

The total compact serialized response, including metadata and diagnostics, remains within the requested estimate of UTF-8 bytes divided by three. Explanations use only remaining space after selected capsules; a small budget can omit diagnostics. Empty results are valid. Recall does not use recall counts or feedback as proof of truth. Explicit, directly linked contradictions expose up to ten applicable IDs per capsule; semantic contradiction detection and multi-hop graph inference are not implemented.
