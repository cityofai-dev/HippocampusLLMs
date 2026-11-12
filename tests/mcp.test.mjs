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
test("MCP recalls through configured local vectors", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hippo-vector-mcp-"));
  const bin = resolve("packages/cli/dist/index.js");
  const command = (args) =>
    spawnSync(process.execPath, [bin, ...args, "--project", dir], {
      encoding: "utf8",
    });
  assert.equal(command(["init"]).status, 0);
  assert.equal(command(["config", "preset", "vector"]).status, 0);
  const stored = JSON.parse(
    command([
      "remember",
      "--kind",
      "decision",
      "--content",
      "Atomic token transactions prevent duplicate refresh",
    ]).stdout,
  );
  const client = new Client({ name: "vector-test", version: "1.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [bin, "serve", "--project", dir],
      stderr: "pipe",
    }),
  );
  try {
    const result = await client.callTool({
      name: "hippocampus_recall",
      arguments: { query: "token transactions" },
    });
    assert.equal(result.isError, undefined);
    assert.match(JSON.stringify(result), new RegExp(stored.id));
  } finally {
    await client.close();
  }
});
