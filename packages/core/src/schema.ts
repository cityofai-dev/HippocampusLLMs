import { z } from "zod";
export const evidenceSchema = z
  .object({
    type: z.enum(["commit", "path", "test", "issue", "user", "other"]),
    reference: z.string().min(1).max(2000),
    observedAt: z.string().datetime().optional(),
    contentHash: z.string().max(128).optional(),
  })
  .strict();
export const relationSchema = z
  .object({
    type: z.enum(["supports", "supersedes", "contradicts", "derived_from"]),
    targetId: z.string().uuid(),
  })
  .strict();
export const recordSchema = z
  .object({
    id: z.string().uuid(),
    schemaVersion: z.literal(1),
    revision: z.number().int().positive(),
    projectId: z.string().uuid(),
    workspaceId: z.string().max(200).optional(),
    scope: z
      .object({
        level: z.enum(["project", "component"]),
        component: z.string().max(200).optional(),
      })
      .strict(),
    applicability: z
      .object({
        environments: z.array(z.string().max(200)).max(20).optional(),
        workspaces: z.array(z.string().max(200)).max(20).optional(),
      })
      .strict(),
    kind: z.enum([
      "decision",
      "constraint",
      "episode",
      "procedure",
      "correction",
      "task",
    ]),
    content: z.string().min(8).max(8000),
    rationale: z.string().max(4000).optional(),
    cues: z.array(z.string().max(200)).max(30),
    entities: z.array(z.string().max(200)).max(30),
    evidence: z.array(evidenceSchema).max(30),
    verification: z.enum(["hypothesis", "observed", "confirmed"]),
    status: z.enum(["active", "superseded", "archived", "expired"]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    validFrom: z.string().datetime().optional(),
    validUntil: z.string().datetime().optional(),
    lastVerifiedAt: z.string().datetime().optional(),
    createdBy: z
      .object({
        client: z.string().max(100),
        agentId: z.string().max(100).optional(),
        sessionId: z.string().max(100).optional(),
      })
      .strict(),
    pinned: z.boolean(),
    expiresAt: z.string().datetime().optional(),
    lastRecalledAt: z.string().datetime().optional(),
    recallCount: z.number().int().nonnegative(),
    relations: z.array(relationSchema).max(30),
    idempotencyKey: z.string().max(200).optional(),
    utilityFeedback: z
      .array(
        z.object({ useful: z.boolean(), observedAt: z.string().datetime() }),
      )
      .max(100)
      .optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.scope.level === "component" && !m.scope.component)
      ctx.addIssue({
        code: "custom",
        message: "Component scope requires component",
      });
  });

export const newMemorySchema = z
  .object(recordSchema.shape)
  .omit({
    id: true,
    schemaVersion: true,
    revision: true,
    projectId: true,
    createdAt: true,
    updatedAt: true,
    recallCount: true,
    lastRecalledAt: true,
    utilityFeedback: true,
  })
  .partial()
  .required({ kind: true, content: true })
  .strict();
