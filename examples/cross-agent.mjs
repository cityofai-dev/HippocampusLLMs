import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/** Scripted client sessions exercise generated host adapters; no agent model is simulated. */
export async function crossAgentDemo() {
  const project = mkdtempSync(join(tmpdir(), "hippocampus handoff "));
  const cli = resolve("packages/cli/dist/index.js");
  const run = (args) => {
    const r = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  run([cli, "init", "--project", project]);
  const launches = {};
  for (const host of ["claude", "codex"]) {
    const output = join(project, host + " plugin");
    run([
      cli,
      "plugin",
      "build",
      host,
      "--project",
      project,
      "--output",
      output,
    ]);
    launches[host] = JSON.parse(
      readFileSync(join(output, ".mcp.json")),
    ).mcpServers.hippocampus;
  }
  const connect = async (host) => {
    const client = new Client({
      name: "scripted-" + host + "-adapter-demo",
      version: "1.0",
    });
    await client.connect(
      new StdioClientTransport({
        ...launches[host],
        cwd: tmpdir(),
        stderr: "pipe",
      }),
    );
    return client;
  };
  const call = async (client, name, args) => {
    const r = await client.callTool({
      name: "hippocampus_" + name,
      arguments: args,
    });
    assert.ok(!r.isError, JSON.stringify(r));
    return r.structuredContent;
  };
  const verify = (attempts) => {
    writeFileSync(
      join(project, "retry.mjs"),
      `export const maxAttempts = ${attempts};\n`,
    );
    writeFileSync(
      join(project, "verify.mjs"),
      `import assert from 'node:assert/strict'; import {maxAttempts} from './retry.mjs'; assert.equal(maxAttempts,${attempts});\n`,
    );
    run([join(project, "verify.mjs")]);
  };
  verify(2);
  let first = await connect("claude");
  let memory;
  try {
    memory = await call(first, "remember", {
      kind: "decision",
      content: "Refresh retry policy allows two attempts",
      verification: "observed",
      rationale: "Synthetic retry fixture passed before capture",
      evidence: [
        { type: "path", reference: "retry.mjs" },
        { type: "test", reference: "node verify.mjs exited 0" },
      ],
      createdBy: { client: "scripted-claude-adapter-demo", sessionId: "first" },
    });
  } finally {
    await first.close();
  }
  const second = await connect("codex");
  try {
    const recalled = await call(second, "recall", {
      query: "Refresh retry policy",
      budget: 1500,
      explain: true,
    });
    assert.equal(recalled.memories[0].id, memory.id);
    verify(3);
    const drift = await call(second, "recall", {
      query: "Refresh retry policy",
    });
    assert.equal(drift.memories[0].evidenceFreshness[0].state, "changed");
    const draft = await call(second, "propose", {
      targetId: memory.id,
      expectedRevision: 1,
      memory: {
        kind: "decision",
        content: "Refresh retry policy allows three attempts",
        verification: "observed",
        rationale:
          "Updated synthetic fixture passed; original evidence changed",
        evidence: [
          { type: "path", reference: "retry.mjs" },
          {
            type: "test",
            reference: "node verify.mjs exited 0 after policy update",
          },
        ],
      },
    });
    assert.equal(
      (await call(second, "review", { id: draft.id, action: "inspect" })).diff
        .before.content,
      memory.content,
    );
    await call(second, "review", {
      id: draft.id,
      action: "accept",
      expectedRevision: 1,
    });
  } finally {
    await second.close();
  }
  first = await connect("claude");
  try {
    const corrected = await call(first, "inspect", { id: memory.id });
    assert.equal(corrected.revision, 2);
    assert.match(corrected.content, /three attempts/);
    assert.equal(corrected.evidenceFreshness[0].state, "current");
    await call(first, "forget", { id: memory.id });
    assert.equal(
      (await call(first, "recall", { query: "Refresh retry policy" })).memories
        .length,
      0,
    );
  } finally {
    await first.close();
  }
  return {
    passed: true,
    project,
    steps: [
      "verified capture",
      "fresh client recall",
      "evidence drift",
      "correction preview",
      "transactional acceptance",
      "new-session correction",
      "forget",
    ],
    mode: "scripted MCP clients using generated Claude/Codex launch definitions; no model calls",
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(JSON.stringify(await crossAgentDemo(), null, 2));
