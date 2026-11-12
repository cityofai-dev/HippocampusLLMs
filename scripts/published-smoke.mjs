import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const dir = mkdtempSync(join(tmpdir(), "hippocampus published smoke "));
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "package.json"), '{"private":true}\n');
const result = spawnSync(
  npm,
  [
    "install",
    "--omit=dev",
    "--no-audit",
    "--no-fund",
    "@hippocampusllms/cli@0.2.0",
  ],
  { cwd: dir, encoding: "utf8", shell: process.platform === "win32" },
);
assert.equal(result.status, 0, result.stderr || result.stdout);
const bin = join(dir, "node_modules/@hippocampusllms/cli/dist/index.js");
const project = join(dir, "project path with spaces");
mkdirSync(project);
function run(args) {
  const execution = spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
  });
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  return execution.stdout ? JSON.parse(execution.stdout) : null;
}
run(["init", "--project", project]);
run(["config", "preset", "hybrid", "--project", project]);
const saved = run([
  "remember",
  "--kind",
  "decision",
  "--content",
  "Published packages must work outside the source workspace",
  "--project",
  project,
]);
const recalled = run([
  "recall",
  "published packages source workspace",
  "--project",
  project,
]);
assert.equal(recalled.memories[0].id, saved.id);
assert.match(recalled.memories[0].reason, /lexical\+vector|vector\+lexical/);
console.log(
  "Published @hippocampusllms/cli@0.2.0 installed and passed init, hybrid recall.",
);
