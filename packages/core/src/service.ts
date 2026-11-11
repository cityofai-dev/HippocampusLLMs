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
export class Service {
  constructor(
    public store: MemoryStoreProvider,
    public projectId: string,
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
    for (const m of this.store.search(this.projectId, query, 100)) {
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
        reason: "lexical term match; active and applicable",
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
