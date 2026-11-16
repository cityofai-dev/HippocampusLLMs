import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Service } from "../../core/src/service.js";
import { applicationTools } from "../../core/src/tools.js";
export async function serve(service: Service, check: () => void = () => {}) {
  const server = new McpServer({ name: "hippocampus", version: "0.3.0" });
  for (const [name, tool] of Object.entries(applicationTools(service))) {
    server.registerTool(
      name,
      { inputSchema: tool.schema },
      async (args: any) => {
        try {
          check();
          const value = tool.run(tool.schema.parse(args));
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
  }
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
