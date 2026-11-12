# Changelog

## 0.2.1 — unreleased

Add a shared-token recall relevance guard and expand the deterministic retrieval evaluation to cover paraphrases, near duplicates, conflicts, stale memories and API versions. Add published-package smoke checks to CI and release-artifact validation across the configured operating-system matrix. Local token vectors did not improve paraphrase recall in the evaluation, so semantic embedding and remote vector providers remain deferred.

## 0.2.0 — published

Add SQLite-backed local token vector retrieval, hybrid and vector modes, and numbered configuration choices. Existing memories are indexed when vector retrieval is enabled. The local model is deterministic token hashing, not semantic embeddings.

## 0.1.1

README and package metadata updates.

## 0.1.0

Initial local CLI, SQLite memory services, strict project configuration and stdio MCP integration. Outstanding release gates are documented in README.
