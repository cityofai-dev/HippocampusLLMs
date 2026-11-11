import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function command(exe, args, cwd) {
  const r = spawnSync(exe, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout;
}
const output = JSON.parse(
  command(
    npm,
    ["pack", "--workspace", "packages/cli", "--json"],
    process.cwd(),
  ),
);
const tar = resolve(output[0].filename);
const dir = mkdtempSync(join(tmpdir(), "hippocampus-packed-"));
writeFileSync(join(dir, "package.json"), '{"private":true}');
command(
  npm,
  ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", tar],
  dir,
);
const bin = join(dir, "node_modules/@hippocampusllms/cli/dist/index.js");
const project = join(dir, "project with spaces");
mkdirSync(project);
command(process.execPath, [bin, "init", "--project", project], dir);
const memory = JSON.parse(
  command(
    process.execPath,
    [
      bin,
      "remember",
      "--kind",
      "decision",
      "--content",
      "Packed artifacts must run without development dependencies",
      "--project",
      project,
    ],
    dir,
  ),
);
const recalled = JSON.parse(
  command(
    process.execPath,
    [bin, "recall", "packed artifacts", "--project", project],
    dir,
  ),
);
assert.equal(recalled.memories[0].id, memory.id);
console.log(
  "Packed package installed outside monorepo; init, remember and recall passed.",
);
