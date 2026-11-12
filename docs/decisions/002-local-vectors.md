# 002: Local token vectors as an optional retrieval index

Keep SQLite as the only implemented canonical store. Add a separate vector table with model and dimension metadata. The configuration wizard offers lexical, hybrid and vector modes; it lists remote backends as planned, not selectable.

The local encoder hashes token counts into 256 dimensions and normalizes the vector. Retrieval scans project vectors, computes cosine similarity and uses a minimum score of 0.15. Hybrid mode fuses FTS5 and vector candidate order with reciprocal ranks. This is a working local vector search with no model download, network call or secret. It is not semantic embedding and can produce hash collisions. It chiefly helps with shared token sets and different term frequencies.

Vector rows are rebuildable from canonical memories. Enabling vectors backfills existing records in a transaction; writes, revisions and deletion update both indexes. Future embedding model or dimension changes must rebuild the vector index after checking persisted metadata. The canonical records stay untouched.
