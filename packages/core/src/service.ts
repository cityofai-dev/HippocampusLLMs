import { randomUUID } from "node:crypto";
import {
  newMemorySchema,
  proposalInputSchema,
  recordSchema,
} from "./schema.js";
import {
  AppError,
  makeMemory,
  estimateTokens,
  type NewMemory,
  type Memory,
} from "./model.js";
import type { MemoryStoreProvider, EvidenceReader } from "./providers.js";

function overlap(query: string, memory: Memory): number {
  const terms = (v: string) =>
    new Set(v.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []);
  const memoryTerms = terms(
    [memory.content, memory.rationale, ...memory.cues, ...memory.entities]
      .filter(Boolean)
      .join(" "),
  );
  return [...terms(query)].filter((t) => memoryTerms.has(t)).length;
}
function exclusion(
  m: Memory,
  environment?: string,
  workspace?: string,
  component?: string,
): string | undefined {
  if (m.scope.level === "component" && m.scope.component !== component)
    return "component_mismatch";
  if (m.workspaceId && m.workspaceId !== workspace) return "workspace_mismatch";
  if (
    m.applicability.environments?.length &&
    !m.applicability.environments.includes(environment ?? "")
  )
    return "environment_mismatch";
  if (
    m.applicability.workspaces?.length &&
    !m.applicability.workspaces.includes(workspace ?? "")
  )
    return "workspace_mismatch";
  const now = new Date().toISOString();
  if (m.status !== "active") return "inactive";
  if (
    (m.expiresAt && m.expiresAt <= now) ||
    (m.validUntil && m.validUntil <= now)
  )
    return "expired";
  if (m.validFrom && m.validFrom > now) return "not_yet_valid";
}
export type MemoryPatch = Partial<
  Pick<
    Memory,
    | "status"
    | "pinned"
    | "expiresAt"
    | "rationale"
    | "evidence"
    | "applicability"
    | "verification"
    | "scope"
    | "cues"
    | "entities"
    | "relations"
    | "workspaceId"
    | "validFrom"
    | "validUntil"
    | "lastVerifiedAt"
  >
>;
export class Service {
  constructor(
    public store: MemoryStoreProvider,
    public projectId: string,
    public retrievalMode: "lexical" | "hybrid" | "vector" = "lexical",
    private evidenceReader?: EvidenceReader,
  ) {}
  private snapshot(input: NewMemory): NewMemory {
    return {
      ...input,
      evidence: input.evidence?.map((e) => {
        if (e.contentHash || !this.evidenceReader) return e;
        const check = this.evidenceReader.check(e);
        return check.currentHash ? { ...e, contentHash: check.currentHash } : e;
      }),
    };
  }
  remember(input: NewMemory) {
    const parsed = newMemorySchema.parse(input);
    for (const relation of parsed.relations ?? [])
      this.inspect(relation.targetId);
    return this.store.create(makeMemory(this.projectId, this.snapshot(parsed)));
  }
  inspect(id: string) {
    const m = this.store.get(this.projectId, id);
    if (!m) throw new AppError("NOT_FOUND", "Memory not found");
    return m;
  }
  freshness(id: string) {
    return this.inspect(id).evidence.map((e) => ({
      ...e,
      ...(this.evidenceReader?.check(e) ?? { state: "unsupported" }),
    }));
  }
  revise(
    id: string,
    content: string | undefined,
    revision: number,
    patch: MemoryPatch = {},
  ) {
    if (!Number.isInteger(revision) || revision < 1)
      throw new AppError(
        "INVALID_INPUT",
        "expectedRevision must be a positive integer",
      );
    const m = this.inspect(id);
    const updated = recordSchema.parse({
      ...m,
      ...patch,
      ...(content !== undefined ? { content } : {}),
    });
    const {
      captureFingerprint: _fingerprint,
      id: _id,
      schemaVersion: _schema,
      revision: _rev,
      projectId: _project,
      createdAt: _created,
      updatedAt: _updated,
      recallCount: _count,
      lastRecalledAt: _last,
      utilityFeedback: _feedback,
      ...event
    } = updated;
    // Apply the same secret and verification checks as capture, preserving provenance and identity.
    makeMemory(this.projectId, event);
    for (const relation of updated.relations) this.inspect(relation.targetId);
    return this.store.update(
      {
        ...updated,
        ...(patch.evidence
          ? {
              evidence: this.snapshot({
                kind: m.kind,
                content: updated.content,
                evidence: patch.evidence,
              }).evidence!,
            }
          : {}),
      },
      revision,
    );
  }
  propose(raw: unknown) {
    const input = proposalInputSchema.parse(raw);
    // Validate and snapshot now; accepting later must not silently refresh evidence.
    const memory = this.snapshot(input.memory);
    makeMemory(this.projectId, memory);
    for (const r of memory.relations ?? []) this.inspect(r.targetId);
    if (
      input.targetId &&
      this.inspect(input.targetId).revision !== input.expectedRevision
    )
      throw new AppError(
        "REVISION_CONFLICT",
        "Proposal targets a stale memory revision",
      );
    return this.store.putProposal({
      id: randomUUID(),
      projectId: this.projectId,
      revision: 1,
      createdAt: new Date().toISOString(),
      input: { ...input, memory },
    });
  }
  proposal(id: string) {
    const proposal = this.store
      .proposals(this.projectId)
      .find((p) => p.id === id);
    if (!proposal) throw new AppError("NOT_FOUND", "Proposal not found");
    const before = proposal.input.targetId
      ? this.inspect(proposal.input.targetId)
      : undefined;
    return {
      ...proposal,
      stale: Boolean(
        before && before.revision !== proposal.input.expectedRevision,
      ),
      diff: {
        before: before
          ? {
              content: before.content,
              rationale: before.rationale,
              evidence: before.evidence,
              applicability: before.applicability,
              verification: before.verification,
              scope: before.scope,
              status: before.status,
              relations: before.relations,
            }
          : null,
        after: proposal.input.memory,
      },
    };
  }
  review(id: string, action: "accept" | "reject", expectedRevision: number) {
    return this.store.atomic(() => {
      const p = this.proposal(id);
      if (p.revision !== expectedRevision)
        throw new AppError(
          "REVISION_CONFLICT",
          "Inspect the proposal before reviewing",
        );
      if (action === "reject") {
        this.store.removeProposal(this.projectId, id);
        return { id, action };
      }
      if (action !== "accept")
        throw new AppError("INVALID_INPUT", "Choose accept or reject");
      if (p.stale)
        throw new AppError(
          "REVISION_CONFLICT",
          "Target changed; submit a new proposal after review",
        );
      const { memory, targetId, expectedRevision: targetRevision } = p.input;
      const {
        kind,
        content,
        createdBy: _createdBy,
        idempotencyKey: _key,
        ...patch
      } = memory;
      if (targetId && this.inspect(targetId).kind !== kind)
        throw new AppError(
          "INVALID_INPUT",
          "Correction cannot change memory kind",
        );
      const record = targetId
        ? this.revise(targetId, content, targetRevision!, patch)
        : this.remember(memory);
      this.store.removeProposal(this.projectId, id);
      return { id, action, diff: p.diff, memory: record };
    });
  }
  inbox() {
    const memories = this.store.list(this.projectId);
    return {
      proposals: this.store.proposals(this.projectId),
      evidenceReviews: memories
        .filter((m) => m.status === "active")
        .flatMap((m) => {
          const changed = this.freshness(m.id).filter((e) =>
            ["changed", "missing"].includes(e.state),
          );
          return changed.length
            ? [
                {
                  id: m.id,
                  revision: m.revision,
                  reason: "evidence_needs_review",
                  evidence: changed,
                },
              ]
            : [];
        })
        .slice(0, 100),
      contradictions: memories
        .filter((m) => m.status === "active")
        .flatMap((m) =>
          m.relations
            .filter(
              (r) =>
                r.type === "contradicts" &&
                memories.some(
                  (other) =>
                    other.id === r.targetId && other.status === "active",
                ),
            )
            .map((r) => ({ id: m.id, targetId: r.targetId })),
        )
        .slice(0, 100),
      limit: 1000,
    };
  }
  recall(
    query: string,
    budget = 1500,
    environment?: string,
    workspace?: string,
    component?: string,
    explain = false,
  ) {
    if (typeof query !== "string" || query.length > 2000)
      throw new AppError(
        "INVALID_INPUT",
        "Query must be at most 2000 characters",
      );
    if (!Number.isInteger(budget) || budget < 1 || budget > 10000)
      throw new AppError(
        "INVALID_INPUT",
        "Budget must be an integer between 1 and 10000",
      );
    const result: {
      schemaVersion: number;
      estimator: string;
      memories: unknown[];
      explanations?: unknown[];
      candidateLimit?: number;
    } = {
      schemaVersion: 1,
      estimator: "UTF-8 bytes / 3, conservative estimate",
      memories: [],
      ...(explain ? { explanations: [], candidateLimit: 100 } : {}),
    };
    if (budget < estimateTokens(result))
      throw new AppError(
        "BUDGET_TOO_SMALL",
        "Budget cannot fit response metadata",
      );
    const minimumOverlap = Math.min(
      2,
      new Set(query.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []).size,
    );
    const lexical =
      this.retrievalMode === "vector"
        ? []
        : this.store.search(this.projectId, query, 100);
    const vector =
      this.retrievalMode === "lexical"
        ? []
        : this.store.searchVector?.(this.projectId, query, 100);
    if (!vector)
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
        const prior = ranked.get(memory.id);
        ranked.set(memory.id, {
          memory,
          score: (prior?.score ?? 0) + 1 / (rank + 1),
          sources: [...(prior?.sources ?? []), source],
        });
      });
    const graph = this.store.list(this.projectId);
    const explanations: unknown[] = [];
    for (const { memory: m, score, sources } of [...ranked.values()].sort(
      (a, b) => b.score - a.score,
    )) {
      const sharedTerms = overlap(query, m);
      let reason =
        exclusion(m, environment, workspace, component) ??
        (minimumOverlap === 0 || sharedTerms < minimumOverlap
          ? "insufficient_relevance"
          : undefined);
      if (!reason) {
        const evidenceFreshness = this.freshness(m.id).map((e) => ({
          reference: e.reference,
          state: e.state,
        }));
        const outgoing = m.relations
          .filter((r) => r.type === "contradicts")
          .map((r) => r.targetId);
        const incoming = graph
          .filter((other) =>
            other.relations.some(
              (r) => r.type === "contradicts" && r.targetId === m.id,
            ),
          )
          .map((other) => other.id);
        const contradictions = [...new Set([...outgoing, ...incoming])]
          .flatMap((id) => {
            const related = this.store.get(this.projectId, id);
            return related &&
              !exclusion(related, environment, workspace, component)
              ? [{ id: related.id, verification: related.verification }]
              : [];
          })
          .slice(0, 10);
        const capsule = {
          id: m.id,
          revision: m.revision,
          content: m.content,
          rationale: m.rationale,
          verification: m.verification,
          evidence: m.evidence,
          relations: m.relations,
          ...(evidenceFreshness.length ? { evidenceFreshness } : {}),
          ...(contradictions.length ? { contradictions } : {}),
          reason: `${sources.join("+")} match; active and applicable`,
        };
        result.memories.push(capsule);
        if (estimateTokens(result) > budget) {
          result.memories.pop();
          reason = "context_budget";
        }
      }
      explanations.push({
        id: m.id,
        selected: !reason,
        reason: reason ?? "selected",
        sharedTerms,
        minimumOverlap,
        rankScore: Number(score.toFixed(4)),
        sources,
      });
    }
    // Diagnostics consume only remaining budget; they never displace selected memories.
    if (explain)
      for (const entry of explanations.slice(0, 25)) {
        result.explanations!.push(entry);
        if (estimateTokens(result) > budget) {
          result.explanations!.pop();
          break;
        }
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
