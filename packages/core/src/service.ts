import { recordSchema } from "./schema.js";
import {
  AppError,
  makeMemory,
  validateText,
  estimateTokens,
  type NewMemory,
  type Memory,
} from "./model.js";
import type { MemoryStoreProvider } from "./providers.js";

function lexicalOverlap(query: string, memory: Memory): number {
  const terms = (value: string) =>
    new Set(value.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []);
  const queryTerms = terms(query);
  if (!queryTerms.size) return 0;
  const memoryTerms = terms(
    [memory.content, memory.rationale, ...memory.cues, ...memory.entities]
      .filter(Boolean)
      .join(" "),
  );
  let shared = 0;
  for (const term of queryTerms) if (memoryTerms.has(term)) shared++;
  return shared;
}

export class Service {
  constructor(
    public store: MemoryStoreProvider,
    public projectId: string,
    public retrievalMode: "lexical" | "hybrid" | "vector" = "lexical",
  ) {}
  remember(input: NewMemory) {
    for (const relation of input.relations ?? [])
      this.inspect(relation.targetId);
    return this.store.create(makeMemory(this.projectId, input));
  }
  inspect(id: string) {
    const m = this.store.get(this.projectId, id);
    if (!m) throw new AppError("NOT_FOUND", "Memory not found");
    return m;
  }
  revise(
    id: string,
    content: string | undefined,
    revision: number,
    patch: Partial<Pick<Memory, "status" | "pinned" | "expiresAt">> = {},
  ) {
    if (!Number.isInteger(revision) || revision < 1)
      throw new AppError(
        "INVALID_INPUT",
        "expectedRevision must be a positive integer",
      );
    if (content !== undefined) validateText(content);
    const m = this.inspect(id);
    return this.store.update(
      recordSchema.parse({
        ...m,
        ...patch,
        ...(content !== undefined ? { content } : {}),
      }),
      revision,
    );
  }
  recall(
    query: string,
    budget = 1500,
    environment?: string,
    workspace?: string,
    component?: string,
  ) {
    if (!Number.isInteger(budget) || budget < 1 || budget > 10000)
      throw new AppError(
        "INVALID_INPUT",
        "Budget must be an integer between 1 and 10000",
      );
    const result: {
      schemaVersion: number;
      estimator: string;
      memories: unknown[];
    } = {
      schemaVersion: 1,
      estimator: "UTF-8 bytes / 3, conservative estimate",
      memories: [],
    };
    if (budget < estimateTokens(result))
      throw new AppError(
        "BUDGET_TOO_SMALL",
        "Budget cannot fit response metadata",
      );
    const now = new Date().toISOString();
    const queryTermCount = new Set(
      query.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? [],
    ).size;
    const minimumOverlap = Math.min(2, queryTermCount);
    const lexical =
      this.retrievalMode === "vector"
        ? []
        : this.store.search(this.projectId, query, 100);
    const vector =
      this.retrievalMode === "lexical"
        ? []
        : this.store.searchVector?.(this.projectId, query, 100);
    if (vector === undefined)
      throw new AppError(
        "INVALID_CONFIG",
        "Configured vector index is unavailable",
      );
    const ranked = new Map<
      string,
      { memory: Memory; score: number; sources: string[] }
    >();
    for (const [source, items] of [
      ["lexical", lexical],
      ["vector", vector],
    ] as const)
      items.forEach((memory, rank) => {
        const existing = ranked.get(memory.id);
        const contribution = 1 / (rank + 1);
        ranked.set(memory.id, {
          memory,
          score: (existing?.score ?? 0) + contribution,
          sources: [...(existing?.sources ?? []), source],
        });
      });
    for (const { memory: m, sources } of [...ranked.values()].sort(
      (a, b) => b.score - a.score,
    )) {
      // FTS's OR query is candidate generation; require a modest lexical
      // signal before surfacing a result. This prevents a lone incidental word
      // from making an unrelated memory look relevant.
      // Token-hash vector collisions can score unrelated records, so require
      // at least a small exact-token signal even in vector-only mode.
      if (lexicalOverlap(query, m) < minimumOverlap) continue;
      if (m.scope.level === "component" && m.scope.component !== component)
        continue;
      if (m.workspaceId && m.workspaceId !== workspace) continue;
      if (
        m.status !== "active" ||
        (m.expiresAt && m.expiresAt < now) ||
        (m.validUntil && m.validUntil < now) ||
        (m.validFrom && m.validFrom > now)
      )
        continue;
      if (
        m.applicability.environments?.length &&
        !m.applicability.environments.includes(environment ?? "")
      )
        continue;
      if (
        m.applicability.workspaces?.length &&
        !m.applicability.workspaces.includes(workspace ?? "")
      )
        continue;
      const capsule = {
        id: m.id,
        revision: m.revision,
        content: m.content,
        rationale: m.rationale,
        verification: m.verification,
        evidence: m.evidence,
        relations: m.relations,
        reason: `${sources.join("+")} match; active and applicable`,
      };
      result.memories.push(capsule);
      if (estimateTokens(result) > budget) result.memories.pop();
    }
    return result;
  }
  feedback(id: string, useful: boolean) {
    const m = this.inspect(id);
    return this.store.update(
      {
        ...m,
        utilityFeedback: [
          ...(m.utilityFeedback ?? []),
          { useful, observedAt: new Date().toISOString() },
        ].slice(-100),
      },
      m.revision,
    );
  }
  forget(id: string) {
    return { deleted: this.store.delete(this.projectId, id) };
  }
}
