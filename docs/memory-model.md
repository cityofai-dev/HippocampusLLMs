# Memory model

The canonical record schema is generated in `schemas/memory.schema.json`. Each record carries a UUID, schema version, optimistic revision, project UUID, content, kind, provenance, verification, lifecycle, applicability and typed relationships. `scope.level=project` means the named project only. Component scope additionally requires a matching component cue. Environment and workspace restrictions are hard filters; an absent recall context does not match a restriction. An optional workspaceId also restricts recall.

An explicit capture is accepted or returns validation errors. Hypotheses expire after 30 days unless an explicit expiry is supplied. Confirmed records require evidence references; the system does not independently recheck those references. Recalling and explicit utility feedback never promote verification. Pinning does not override explicit expiry or validity.

Revision changes preserve identity and creation provenance. Lifecycle statuses distinguish active, archived, expired and superseded records. This implementation excludes inactive records from recall. It does not automatically supersede a claim based on wording. Relations retain conflicting claims for inspection. Recall exposes up to ten directly linked applicable contradictory record IDs. The inbox shows explicit contradiction links; similarity does not establish contradiction. Path evidence freshness is reported separately from verification. See [review and recall](review-and-recall.md).

Forget removes the record and recursively removes content-bearing derived records. It removes FTS entries, related pending proposals and references from remaining records in one transaction. This does not erase external evidence, backups, WAL history or filesystem snapshots.

Capture fingerprints enforce exact event idempotency across rationale, evidence, scope and provenance. New optional internal metadata preserves the version 1 record schema; clients cannot supply fingerprints. Existing records without a fingerprint retain conservative legacy duplicate checks.
