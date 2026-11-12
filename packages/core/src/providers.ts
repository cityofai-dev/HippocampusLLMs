import type { Memory } from "./model.js";
export interface MemoryStoreProvider {
  readonly name: string;
  get(projectId: string, id: string): Memory | undefined;
  list(projectId: string): Memory[];
  create(memory: Memory): Memory;
  update(memory: Memory, expectedRevision: number): Memory;
  delete(projectId: string, id: string): boolean;
  search(projectId: string, query: string, limit: number): Memory[];
  searchVector?(projectId: string, query: string, limit: number): Memory[];
  close(): void;
}
export interface VectorIndexProvider {
  readonly name: string;
  readonly implemented: boolean;
}
export interface EmbeddingProvider {
  readonly name: string;
  readonly implemented: boolean;
  readonly dimensions?: number;
}
export const providerRegistry = {
  stores: [
    { name: "sqlite", implemented: true, canonical: true },
    { name: "postgresql", implemented: false, canonical: true },
  ],
  vectors: [
    { name: "none", implemented: true },
    { name: "sqlite", implemented: true },
    { name: "qdrant", implemented: false },
    { name: "pgvector", implemented: false },
  ],
  embeddings: [
    { name: "none", implemented: true },
    { name: "local-hash", implemented: true, dimensions: 256, semantic: false },
  ],
} as const;

/** Optional retrieval indexes are rebuildable; they never own canonical records. */
export interface VectorIndex {
  readonly model: {
    provider: string;
    model: string;
    version: string;
    dimensions: number;
  };
  upsert(
    projectId: string,
    id: string,
    vector: readonly number[],
    signal?: AbortSignal,
  ): Promise<void>;
  search(
    projectId: string,
    vector: readonly number[],
    limit: number,
    signal?: AbortSignal,
  ): Promise<{ id: string; score: number }[]>;
  delete(projectId: string, id: string): Promise<void>;
}
export interface Embeddings {
  readonly model: {
    provider: string;
    model: string;
    version: string;
    dimensions: number;
  };
  embed(
    texts: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly number[][]>;
}
export interface ExtractionProvider {
  readonly outboundDataDescription: string;
  propose(
    event: { projectId: string; content: string },
    signal?: AbortSignal,
  ): Promise<unknown[]>;
}
export interface ConsolidationProvider {
  readonly outboundDataDescription: string;
  propose(records: readonly Memory[], signal?: AbortSignal): Promise<unknown[]>;
}
