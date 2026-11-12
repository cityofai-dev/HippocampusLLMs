import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { evidenceSchema, relationSchema } from "../../core/src/schema.js";
import { z } from "zod";
import { Service } from "../../core/src/service.js";
export async function serve(service: Service, check: () => void = () => {}) {
  const server = new McpServer({ name: "hippocampus", version: "0.2.0" });
  const register = (
    name: string,
    shape: z.ZodRawShape,
    fn: (a: any) => unknown,
  ) =>
    server.registerTool(
      "hippocampus_" + name,
      { inputSchema: shape },
      async (a) => {
        try {
          check();
          const value = fn(a);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(value) }],
            structuredContent: value as Record<string, unknown>,
          };
        } catch (e) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  code: (e as any).code ?? "INVALID_INPUT",
                  message: String(e),
                }),
              },
            ],
          };
        }
      },
    );
  register(
    "recall",
    {
      query: z.string().max(2000),
      budget: z.number().int().min(100).max(10000).optional(),
      component: z.string().optional(),
      environment: z.string().optional(),
      workspace: z.string().optional(),
    },
    (a) =>
      service.recall(
        a.query,
        a.budget,
        a.environment,
        a.workspace,
        a.component,
      ),
  );
  register(
    "remember",
    {
      kind: z.enum([
        "decision",
        "constraint",
        "episode",
        "procedure",
        "correction",
        "task",
      ]),
      content: z.string().max(8000),
      rationale: z.string().max(4000).optional(),
      verification: z.enum(["hypothesis", "observed", "confirmed"]).optional(),
      evidence: z.array(evidenceSchema).max(30).optional(),
      relations: z.array(relationSchema).max(30).optional(),
      applicability: z
        .object({
          environments: z.array(z.string()).max(20).optional(),
          workspaces: z.array(z.string()).max(20).optional(),
        })
        .optional(),
      idempotencyKey: z.string().max(200).optional(),
    },
    (a) => service.remember(a),
  );
  register("inspect", { id: z.string().uuid() }, (a) => service.inspect(a.id));
  register(
    "revise",
    {
      id: z.string().uuid(),
      content: z.string().max(8000).optional(),
      status: z
        .enum(["active", "superseded", "archived", "expired"])
        .optional(),
      pinned: z.boolean().optional(),
      expectedRevision: z.number().int().positive(),
    },
    (a) =>
      service.revise(a.id, a.content, a.expectedRevision, {
        ...(a.status ? { status: a.status } : {}),
        ...(a.pinned !== undefined ? { pinned: a.pinned } : {}),
      }),
  );
  register("forget", { id: z.string().uuid() }, (a) => service.forget(a.id));
  register("feedback", { id: z.string().uuid(), useful: z.boolean() }, (a) =>
    service.feedback(a.id, a.useful),
  );
  let closed = false;
  const closeStore = () => {
    if (!closed) {
      closed = true;
      service.store.close();
    }
  };
  server.server.onclose = closeStore;
  const close = async () => {
    await server.close();
    closeStore();
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
  await server.connect(new StdioServerTransport());
}
