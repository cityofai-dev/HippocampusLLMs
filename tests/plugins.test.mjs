import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
test("generated host plugins bind to an explicit project and survive unrelated cwd", async () => {
  const project = mkdtempSync(join(tmpdir(), "hippo plugin spaces "));
  const cli = resolve("packages/cli/dist/index.js");
  const run = (args) => spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(run([cli, "init", "--project", project]).status, 0);
  const args = [
    "scripts/package-plugins.mjs",
    "--project",
    project,
    "--output",
    join(project, "artifacts"),
  ];
  assert.equal(run(args).status, 0);
  assert.notEqual(run(args).status, 0, "must refuse overwrites");
  for (const host of ["claude", "codex"]) {
    const launch = JSON.parse(
      readFileSync(join(project, "artifacts", host, ".mcp.json")),
    ).mcpServers.hippocampus;
    assert.ok(launch.args.includes(realpathSync(project)));
    const client = new Client({ name: host + "-plugin-test", version: "1.0" });
    await client.connect(
      new StdioClientTransport({ ...launch, cwd: tmpdir(), stderr: "pipe" }),
    );
    try {
      const tools = await client.listTools();
      assert.equal(tools.tools.length, 9);
    } finally {
      await client.close();
    }
  }
});
