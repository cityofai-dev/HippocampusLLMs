import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
test("two MCP clients share durable memory and report tool errors", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hippo-mcp-"));
  const bin = resolve("packages/cli/dist/index.js");
  assert.equal(
    spawnSync(process.execPath, [bin, "init", "--project", dir]).status,
    0,
  );
  const connect = async () => {
    const c = new Client({ name: "test", version: "1.0" });
    await c.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [bin, "serve", "--project", dir],
        stderr: "pipe",
      }),
    );
    return c;
  };
  const first = await connect();
  const second = await connect();
  try {
    const tools = await first.listTools();
    assert.equal(tools.tools.length, 6);
    const result = await first.callTool({
      name: "hippocampus_remember",
      arguments: {
        kind: "constraint",
        content: "SQLite writes must use bounded busy timeouts",
      },
    });
    assert.equal(result.isError, undefined);
    const recalled = await second.callTool({
      name: "hippocampus_recall",
      arguments: { query: "SQLite writes" },
    });
    assert.match(JSON.stringify(recalled), /bounded busy/);
    const invalid = await second.callTool({
      name: "hippocampus_remember",
      arguments: { kind: "constraint", content: "tiny" },
    });
    assert.equal(invalid.isError, true);
  } finally {
    await first.close();
    await second.close();
  }
});
