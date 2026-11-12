import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
const root = mkdtempSync(join(tmpdir(), "hippocampus host smoke "));
const home = join(root, "isolated home");
const project = join(root, "project path with spaces");
mkdirSync(home, { recursive: true });
mkdirSync(join(home, ".codex"), { recursive: true });
mkdirSync(project, { recursive: true });
const bin = resolve("packages/cli/dist/index.js");
const env = { ...process.env, HOME: home, CODEX_HOME: join(home, ".codex") };
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: project,
    env,
    encoding: "utf8",
    timeout: 30000,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
run(process.execPath, [bin, "init", "--project", project]);
for (const [label, host, args, listArgs] of [
  [
    "Claude Code",
    "claude",
    [
      "mcp",
      "add",
      "--transport",
      "stdio",
      "--scope",
      "user",
      "hippocampus-smoke",
      "--",
      process.execPath,
      bin,
      "serve",
      "--transport",
      "stdio",
      "--project",
      project,
    ],
    ["mcp", "list"],
  ],
  [
    "Codex",
    "codex",
    [
      "mcp",
      "add",
      "hippocampus-smoke",
      "--",
      process.execPath,
      bin,
      "serve",
      "--transport",
      "stdio",
      "--project",
      project,
    ],
    ["mcp", "list", "--json"],
  ],
]) {
  run(host, args);
  const listing = run(host, listArgs);
  assert.match(listing, /hippocampus-smoke/);
  if (label === "Claude Code") {
    // `claude mcp list` performs a health check for the user-scoped server.
    assert.match(listing, /Connected/i, listing);
    console.log(
      "Claude Code: user-scoped server registered and stdio health check connected.",
    );
  } else {
    // Codex's list command reports configuration, but does not invoke the server.
    const entry = JSON.parse(listing).find(
      (server) => server.name === "hippocampus-smoke",
    );
    assert.ok(entry, listing);
    assert.equal(entry.enabled, true);
    assert.equal(entry.transport?.command, process.execPath);
    assert.ok(entry.transport?.args?.includes("serve"));
    console.log(
      "Codex: enabled stdio server configuration recognized; live tool invocation is not tested by `codex mcp list`.",
    );
  }
  run(host, ["mcp", "remove", "hippocampus-smoke"]);
}
