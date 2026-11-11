import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const dataset = JSON.parse(
  readFileSync(new URL("./fixtures/retrieval.json", import.meta.url), "utf8"),
);
const dir = mkdtempSync(join(tmpdir(), "hippocampus-eval-"));
const bin = resolve("packages/cli/dist/index.js");
const run = (...args) => {
  const result = spawnSync(process.execPath, [bin, ...args, "--project", dir], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw Error(result.stderr);
  return JSON.parse(result.stdout);
};
run("init");
for (const event of dataset.memories) {
  const path = join(dir, "input.json");
  writeFileSync(path, JSON.stringify(event));
  run("remember", "--input", path);
}
for (const strategy of [
  "no memory",
  "fixed instruction file",
  "selective recall",
]) {
  let hit = 0,
    total = 0,
    expected = 0,
    cost = 0,
    stale = 0;
  const start = performance.now();
  for (const task of dataset.tasks) {
    const selected =
      strategy === "no memory"
        ? []
        : strategy === "fixed instruction file"
          ? dataset.memories
          : run("recall", task.query).memories;
    expected += task.relevant.length;
    for (const record of selected) {
      const index = dataset.memories.findIndex(
        (m) => m.content === record.content,
      );
      hit += Number(task.relevant.includes(index));
      stale += Number(Boolean(dataset.memories[index]?.expiresAt));
    }
    total += selected.length;
    cost += Math.ceil(Buffer.byteLength(JSON.stringify(selected)) / 3);
  }
  console.log(
    JSON.stringify({
      strategy,
      precision: total ? hit / total : 0,
      recall: expected ? hit / expected : 0,
      staleRate: total ? stale / total : 0,
      contextEstimate: cost,
      latencyMs: performance.now() - start,
      taskOutcomes: "not measured; retrieval-only evaluation, no model used",
    }),
  );
}
