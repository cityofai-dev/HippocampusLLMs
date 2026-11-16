import { z } from "zod";
import {
  newMemorySchema,
  proposalInputSchema,
  recordSchema,
} from "./schema.js";
import { Service } from "./service.js";
const id = z.string().uuid();
const revision = z.number().int().positive();
export function applicationTools(service: Service) {
  return {
    hippocampus_recall: {
      schema: z
        .object({
          query: z.string().max(2000),
          budget: z.number().int().min(100).max(10000).optional(),
          component: z.string().max(200).optional(),
          environment: z.string().max(200).optional(),
          workspace: z.string().max(200).optional(),
          explain: z.boolean().optional(),
        })
        .strict(),
      run: (a: any) =>
        service.recall(
          a.query,
          a.budget,
          a.environment,
          a.workspace,
          a.component,
          a.explain,
        ),
    },
    hippocampus_remember: {
      schema: newMemorySchema,
      run: (a: any) => service.remember(a),
    },
    hippocampus_inspect: {
      schema: z.object({ id }).strict(),
      run: (a: any) => ({
        ...service.inspect(a.id),
        evidenceFreshness: service.freshness(a.id),
      }),
    },
    hippocampus_revise: {
      schema: z
        .object({
          id,
          expectedRevision: revision,
          content: z.string().min(8).max(8000).optional(),
          ...Object.fromEntries(
            [
              "status",
              "pinned",
              "expiresAt",
              "rationale",
              "evidence",
              "applicability",
              "verification",
              "scope",
              "cues",
              "entities",
              "relations",
              "workspaceId",
              "validFrom",
              "validUntil",
              "lastVerifiedAt",
            ].map((k) => [k, (recordSchema.shape as any)[k].optional()]),
          ),
        })
        .strict(),
      run: (a: any) => {
        const { id, expectedRevision, content, ...patch } = a;
        return service.revise(id, content, expectedRevision, patch);
      },
    },
    hippocampus_forget: {
      schema: z.object({ id }).strict(),
      run: (a: any) => service.forget(a.id),
    },
    hippocampus_feedback: {
      schema: z.object({ id, useful: z.boolean() }).strict(),
      run: (a: any) => service.feedback(a.id, a.useful),
    },
    hippocampus_propose: {
      schema: proposalInputSchema,
      run: (a: any) => service.propose(a),
    },
    hippocampus_inbox: {
      schema: z.object({}).strict(),
      run: () => service.inbox(),
    },
    hippocampus_review: {
      schema: z
        .object({
          id,
          action: z.enum(["inspect", "accept", "reject"]),
          expectedRevision: revision.optional(),
        })
        .strict(),
      run: (a: any) =>
        a.action === "inspect"
          ? service.proposal(a.id)
          : service.review(a.id, a.action, a.expectedRevision),
    },
  };
}
export function callApplicationTool(
  service: Service,
  name: string,
  input: unknown,
) {
  const tools = applicationTools(service);
  if (!Object.hasOwn(tools, name)) throw new Error("Unknown application tool");
  const tool = tools[name as keyof typeof tools];
  return tool.run(tool.schema.parse(input));
}
