# Memory model

The canonical record schema is generated in `schemas/memory.schema.json`. Each record carries a UUID, schema version, optimistic revision, project UUID, content, kind, provenance, verification, lifecycle, applicability and typed relationships. `scope.level=project` means the named project only. Component scope additionally requires a matching component cue. Environment and workspace restrictions are hard filters; an absent recall context does not match a restriction. An optional workspaceId also restricts recall.

An explicit capture is accepted or returns validation errors. Hypotheses expire after 30 days unless an explicit expiry is supplied. Confirmed records require evidence references; the system does not independently recheck those references. Recalling and explicit utility feedback never promote verification. Pinning does not override explicit expiry or validity.

Revision changes preserve identity and creation provenance. Lifecycle statuses distinguish active, archived, expired and superseded records. This implementation excludes inactive records from recall. It does not automatically supersede a claim based on wording. Relations retain conflicting claims for inspection. Graph-based contradiction expansion and evidence freshness checks remain pending.

Forget removes the record and recursively removes content-bearing derived records. It removes FTS entries and references from remaining records in one transaction. This does not erase external evidence, backups, WAL history or filesystem snapshots.
