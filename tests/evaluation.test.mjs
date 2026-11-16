import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("evaluation verifies each retrieval mode and benchmark dry-run reports no invented task outcomes", () => {
  const retrieval = spawnSync(process.execPath, ["tests/evaluation.mjs"], {
    encoding: "utf8",
    timeout: 60000,
  });
  assert.equal(retrieval.status, 0, retrieval.stderr);
  const rows = retrieval.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  for (const mode of ["lexical", "hybrid", "vector"])
    assert.equal(rows.find((r) => r.strategy === mode).configuredMode, mode);
  const benchmark = spawnSync(
    process.execPath,
    ["scripts/agent-benchmark.mjs"],
    { encoding: "utf8", timeout: 30000 },
  );
  assert.equal(benchmark.status, 0, benchmark.stderr);
  const tasks = benchmark.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(tasks.length, 3);
  for (const task of tasks) {
    assert.equal(task.taskPassed, null);
    assert.equal(task.repeatedFailures, null);
    assert.equal(task.client, "not invoked");
  }
});
