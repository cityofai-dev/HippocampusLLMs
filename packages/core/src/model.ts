import { recordSchema, newMemorySchema } from "./schema.js";
import { randomUUID, createHash } from "node:crypto";

export type Kind =
  | "decision"
  | "constraint"
  | "episode"
  | "procedure"
  | "correction"
  | "task";
export type Status = "active" | "superseded" | "archived" | "expired";
export type Verification = "hypothesis" | "observed" | "confirmed";
export type Evidence = {
  type: "commit" | "path" | "test" | "issue" | "user" | "other";
  reference: string;
  observedAt?: string;
  contentHash?: string;
};
export type Relation = {
  type: "supports" | "supersedes" | "contradicts" | "derived_from";
  targetId: string;
};
export type Memory = {
  id: string;
  schemaVersion: 1;
  revision: number;
  projectId: string;
  workspaceId?: string;
  scope: { level: "project" | "component"; component?: string };
  applicability: { environments?: string[]; workspaces?: string[] };
  kind: Kind;
  content: string;
  rationale?: string;
  cues: string[];
  entities: string[];
  evidence: Evidence[];
  verification: Verification;
  status: Status;
  createdAt: string;
  updatedAt: string;
  validFrom?: string;
  validUntil?: string;
  lastVerifiedAt?: string;
  createdBy: { client: string; agentId?: string; sessionId?: string };
  pinned: boolean;
  expiresAt?: string;
  lastRecalledAt?: string;
  recallCount: number;
  relations: Relation[];
  idempotencyKey?: string;
  utilityFeedback?: { useful: boolean; observedAt: string }[];
};
export type NewMemory = Pick<Memory, "kind" | "content"> &
  Partial<
    Omit<
      Memory,
      | "id"
      | "schemaVersion"
      | "revision"
      | "projectId"
      | "createdAt"
      | "updatedAt"
      | "recallCount"
      | "kind"
      | "content"
    >
  >;
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AppError("INVALID_INPUT", message);
}
export function validateText(text: string): void {
  assert(
    typeof text === "string" && text.trim().length >= 8 && text.length <= 8000,
    "content must contain 8–8000 characters",
  );
  assert(
    !/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,})\b/i.test(
      text,
    ),
    "content appears to contain a credential",
  );
}
export function makeMemory(projectId: string, rawInput: NewMemory): Memory {
  const input = newMemorySchema.parse(rawInput);
  validateText(input.content);
  assert(
    [
      "decision",
      "constraint",
      "episode",
      "procedure",
      "correction",
      "task",
    ].includes(input.kind),
    "invalid kind",
  );
  assert(
    !/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,})\b/i.test(
      JSON.stringify(input),
    ),
    "memory metadata appears to contain a credential",
  );
  assert(
    input.verification !== "confirmed" || Boolean(input.evidence?.length),
    "confirmed memories require evidence",
  );
  const now = new Date().toISOString();
  return recordSchema.parse({
    id: randomUUID(),
    schemaVersion: 1,
    revision: 1,
    projectId,
    scope: input.scope ?? { level: "project" },
    applicability: input.applicability ?? {},
    kind: input.kind,
    content: input.content.trim(),
    rationale: input.rationale,
    cues: input.cues ?? [],
    entities: input.entities ?? [],
    evidence: input.evidence ?? [],
    verification: input.verification ?? "hypothesis",
    status: input.status ?? "active",
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy ?? { client: "cli" },
    pinned: input.pinned ?? false,
    expiresAt:
      input.expiresAt ??
      ((input.verification ?? "hypothesis") === "hypothesis"
        ? new Date(Date.now() + 30 * 86400000).toISOString()
        : undefined),
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    workspaceId: input.workspaceId,
    lastVerifiedAt: input.lastVerifiedAt,
    recallCount: 0,
    relations: input.relations ?? [],
    idempotencyKey: input.idempotencyKey,
  });
}
export function workspaceId(root: string): string {
  return createHash("sha256").update(root).digest("hex").slice(0, 16);
}
export function estimateTokens(value: unknown): number {
  return Math.ceil(Buffer.byteLength(JSON.stringify(value)) / 3);
}
