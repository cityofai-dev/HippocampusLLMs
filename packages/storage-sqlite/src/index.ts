import { recordSchema } from "../../core/src/schema.js";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { MemoryStoreProvider } from "../../core/src/providers.js";
import { AppError, type Memory } from "../../core/src/model.js";
import {
  localVector,
  similarity,
  LOCAL_VECTOR_DIMENSIONS,
  LOCAL_VECTOR_MODEL,
} from "../../core/src/local-vector.js";

type Row = { body: string };
export class SqliteStore implements MemoryStoreProvider {
  readonly name = "sqlite";
  private db: DatabaseSync;
  private vectorEnabled = false;
  constructor(readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path, { timeout: 2500 });
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=2500;",
    );
    this.migrate();
  }
  private migrate(): void {
    const version = (
      this.db.prepare("PRAGMA user_version").get() as { user_version: number }
    ).user_version;
    if (version > 2)
      throw new AppError(
        "INVALID_CONFIG",
        "Database schema is newer than this CLI",
      );
    if (version === 0) {
      this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision INTEGER NOT NULL,
          status TEXT NOT NULL, idempotency_key TEXT, body TEXT NOT NULL);
        CREATE UNIQUE INDEX IF NOT EXISTS memories_idempotency ON memories(project_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
        CREATE INDEX IF NOT EXISTS memories_project ON memories(project_id,status);
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(id UNINDEXED, project_id UNINDEXED, content, cues, entities);
        PRAGMA user_version=1; COMMIT;`);
    }
    if (version < 2) {
      this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS memory_vectors (
          id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
          project_id TEXT NOT NULL, vector TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS memory_vectors_project ON memory_vectors(project_id);
        CREATE TABLE IF NOT EXISTS vector_metadata (
          singleton INTEGER PRIMARY KEY CHECK(singleton=1),
          model TEXT NOT NULL, dimensions INTEGER NOT NULL
        );
        PRAGMA user_version=2; COMMIT;`);
    }
  }
  enableLocalVectors(): void {
    this.transaction(() => {
      const metadata = this.db
        .prepare(
          "SELECT model,dimensions FROM vector_metadata WHERE singleton=1",
        )
        .get() as { model: string; dimensions: number } | undefined;
      if (
        metadata &&
        (metadata.model !== LOCAL_VECTOR_MODEL ||
          metadata.dimensions !== LOCAL_VECTOR_DIMENSIONS)
      ) {
        this.db.exec(
          "DELETE FROM memory_vectors; DELETE FROM vector_metadata;",
        );
      }
      this.db
        .prepare(
          "INSERT OR REPLACE INTO vector_metadata(singleton,model,dimensions) VALUES(1,?,?)",
        )
        .run(LOCAL_VECTOR_MODEL, LOCAL_VECTOR_DIMENSIONS);
      const missing = this.db
        .prepare(
          "SELECT m.body FROM memories m LEFT JOIN memory_vectors v ON m.id=v.id WHERE v.id IS NULL",
        )
        .all() as Row[];
      for (const row of missing)
        this.indexVector(recordSchema.parse(JSON.parse(row.body)));
    });
    this.vectorEnabled = true;
  }
  private transaction<T>(fn: () => T): T {
    try {
      this.db.exec("BEGIN IMMEDIATE");
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      if (String(error).includes("SQLITE_BUSY"))
        throw new AppError("STORE_BUSY", "SQLite is busy; retry shortly");
      throw error;
    }
  }
  private find(id: string): Memory | undefined {
    const row = this.db
      .prepare("SELECT body FROM memories WHERE id=?")
      .get(id) as Row | undefined;
    return row ? recordSchema.parse(JSON.parse(row.body)) : undefined;
  }
  get(projectId: string, id: string): Memory | undefined {
    const found = this.find(id);
    if (found && found.projectId !== projectId)
      throw new AppError(
        "PROJECT_MISMATCH",
        "Memory belongs to another project",
      );
    return found;
  }
  list(projectId: string): Memory[] {
    return (
      this.db
        .prepare(
          "SELECT body FROM memories WHERE project_id=? ORDER BY rowid DESC LIMIT 1000",
        )
        .all(projectId) as Row[]
    ).map((r) => recordSchema.parse(JSON.parse(r.body)));
  }
  create(memory: Memory): Memory {
    return this.transaction(() => {
      if (memory.idempotencyKey) {
        const row = this.db
          .prepare(
            "SELECT body FROM memories WHERE project_id=? AND idempotency_key=?",
          )
          .get(memory.projectId, memory.idempotencyKey) as Row | undefined;
        if (row) {
          const prior = recordSchema.parse(JSON.parse(row.body));
          if (
            prior.kind !== memory.kind ||
            prior.content !== memory.content ||
            JSON.stringify(prior.evidence) !==
              JSON.stringify(memory.evidence) ||
            JSON.stringify(prior.applicability) !==
              JSON.stringify(memory.applicability)
          )
            throw new AppError(
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key was used for a different event",
            );
          return prior;
        }
      }
      this.db
        .prepare(
          "INSERT INTO memories(id,project_id,revision,status,idempotency_key,body) VALUES(?,?,?,?,?,?)",
        )
        .run(
          memory.id,
          memory.projectId,
          memory.revision,
          memory.status,
          memory.idempotencyKey ?? null,
          JSON.stringify(memory),
        );
      this.index(memory);
      if (this.vectorEnabled) this.indexVector(memory);
      return memory;
    });
  }
  private index(memory: Memory): void {
    this.db.prepare("DELETE FROM memory_fts WHERE id=?").run(memory.id);
    this.db
      .prepare(
        "INSERT INTO memory_fts(id,project_id,content,cues,entities) VALUES(?,?,?,?,?)",
      )
      .run(
        memory.id,
        memory.projectId,
        memory.content,
        memory.cues.join(" "),
        memory.entities.join(" "),
      );
  }
  private indexVector(memory: Memory): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO memory_vectors(id,project_id,vector) VALUES(?,?,?)",
      )
      .run(
        memory.id,
        memory.projectId,
        JSON.stringify(
          localVector(
            [memory.content, ...memory.cues, ...memory.entities].join(" "),
          ),
        ),
      );
  }
  update(memory: Memory, expectedRevision: number): Memory {
    return this.transaction(() => {
      const prior = this.get(memory.projectId, memory.id);
      if (!prior) throw new AppError("NOT_FOUND", "Memory not found");
      if (prior.revision !== expectedRevision)
        throw new AppError(
          "REVISION_CONFLICT",
          "Memory changed since it was read",
          { currentRevision: prior.revision },
        );
      memory.revision = expectedRevision + 1;
      memory.updatedAt = new Date().toISOString();
      this.db
        .prepare("UPDATE memories SET revision=?,status=?,body=? WHERE id=?")
        .run(memory.revision, memory.status, JSON.stringify(memory), memory.id);
      this.index(memory);
      if (this.vectorEnabled) this.indexVector(memory);
      return memory;
    });
  }
  delete(projectId: string, id: string): boolean {
    return this.transaction(() => {
      const current = this.get(projectId, id);
      if (!current) return false;
      // Content-bearing derived memories cannot survive deletion of their source.
      const all = (
        this.db
          .prepare("SELECT body FROM memories WHERE project_id=?")
          .all(projectId) as Row[]
      ).map((row) => recordSchema.parse(JSON.parse(row.body)));
      const removed = new Set([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const m of all)
          if (
            !removed.has(m.id) &&
            m.relations.some(
              (r) => r.type === "derived_from" && removed.has(r.targetId),
            )
          ) {
            removed.add(m.id);
            changed = true;
          }
      }
      const derived = all.filter((m) => removed.has(m.id) && m.id !== id);
      for (const m of derived) {
        this.db.prepare("DELETE FROM memory_fts WHERE id=?").run(m.id);
        this.db.prepare("DELETE FROM memories WHERE id=?").run(m.id);
      }
      this.db.prepare("DELETE FROM memory_fts WHERE id=?").run(id);
      this.db.prepare("DELETE FROM memories WHERE id=?").run(id);
      for (const m of all.filter((record) => !removed.has(record.id))) {
        const relations = m.relations.filter((r) => !removed.has(r.targetId));
        if (relations.length !== m.relations.length) {
          m.relations = relations;
          m.revision++;
          m.updatedAt = new Date().toISOString();
          this.db
            .prepare("UPDATE memories SET revision=?,body=? WHERE id=?")
            .run(m.revision, JSON.stringify(m), m.id);
        }
      }
      return true;
    });
  }
  search(projectId: string, query: string, limit: number): Memory[] {
    const terms = [
      ...new Set(query.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []),
    ].slice(0, 12);
    if (!terms.length) return [];
    const expression = terms
      .map((t) => `"${t.replaceAll('"', "")}"`)
      .join(" OR ");
    const rows = this.db
      .prepare(
        `SELECT m.body FROM memory_fts f JOIN memories m ON m.id=f.id
      WHERE memory_fts MATCH ? AND m.project_id=? ORDER BY bm25(memory_fts) LIMIT ?`,
      )
      .all(expression, projectId, Math.min(limit, 100)) as Row[];
    return rows.map((r) => recordSchema.parse(JSON.parse(r.body)));
  }
  searchVector(projectId: string, query: string, limit: number): Memory[] {
    if (!this.vectorEnabled)
      throw new AppError("INVALID_CONFIG", "Local vector index is not enabled");
    const queryVector = localVector(query);
    if (!queryVector.some(Boolean)) return [];
    const rows = this.db
      .prepare(
        "SELECT m.body,v.vector FROM memory_vectors v JOIN memories m ON m.id=v.id WHERE v.project_id=?",
      )
      .all(projectId) as (Row & { vector: string })[];
    return rows
      .map((row) => ({
        memory: recordSchema.parse(JSON.parse(row.body)),
        score: similarity(queryVector, JSON.parse(row.vector) as number[]),
      }))
      .filter((item) => item.score >= 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(limit, 100))
      .map((item) => item.memory);
  }
  close(): void {
    this.db.close();
  }
}
