import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
// Check npm's current release independently of an unpublished source version.
// Release verification can pin HIPPOCAMPUS_SMOKE_VERSION explicitly.
const version = process.env.HIPPOCAMPUS_SMOKE_VERSION ?? "latest";
assert.match(version, /^(?:latest|\d+\.\d+\.\d+(?:-[\w.-]+)?)$/);
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
    "--cache",
    join(dir, "npm-cache"),
    "--fetch-retries=1",
    "--fetch-timeout=30000",
    `@hippocampusllms/cli@${version}`,
  ],
  { cwd: dir, encoding: "utf8", shell: process.platform === "win32" },
);
assert.equal(result.status, 0, result.stderr || result.stdout);
const installedVersion = JSON.parse(
  readFileSync(
    join(dir, "node_modules/@hippocampusllms/cli/package.json"),
    "utf8",
  ),
).version;
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
  `Published @hippocampusllms/cli@${installedVersion} installed and passed init, hybrid recall.`,
);
