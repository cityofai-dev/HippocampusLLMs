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
const eventPath = join(dir, "event.json");
for (const event of dataset.memories) {
  writeFileSync(eventPath, JSON.stringify(event));
  run("remember", "--input", eventPath);
}
const strategies = ["no memory", "fixed instruction file"];
for (const mode of ["lexical", "hybrid", "vector"]) {
  run("config", "preset", mode);
  strategies.push(mode);
}
for (const strategy of strategies) {
  let hit = 0,
    total = 0,
    expected = 0,
    cost = 0,
    stale = 0,
    irrelevantTasks = 0,
    irrelevantFalsePositives = 0;
  const categoryStats = {};
  const start = performance.now();
  for (const task of dataset.tasks) {
    const category = task.category ?? "uncategorized";
    const categoryStat = (categoryStats[category] ??= {
      hits: 0,
      expected: 0,
      tasks: 0,
      falsePositiveTasks: 0,
    });
    categoryStat.expected += task.relevant.length;
    categoryStat.tasks += 1;
    const selected =
      strategy === "no memory"
        ? []
        : strategy === "fixed instruction file"
          ? dataset.memories
          : run("recall", task.query, "--budget", "1500").memories;
    expected += task.relevant.length;
    for (const record of selected) {
      const index = dataset.memories.findIndex(
        (memory) => memory.content === record.content,
      );
      const relevant = task.relevant.includes(index);
      hit += Number(relevant);
      categoryStat.hits += Number(relevant);
      stale += Number(Boolean(dataset.memories[index]?.expiresAt));
    }
    if (task.relevant.length === 0) {
      irrelevantTasks += 1;
      irrelevantFalsePositives += Number(selected.length > 0);
      categoryStat.falsePositiveTasks += Number(selected.length > 0);
    }
    total += selected.length;
    cost += Math.ceil(Buffer.byteLength(JSON.stringify(selected)) / 3);
  }
  console.log(
    JSON.stringify({
      strategy,
      precision: total ? hit / total : null,
      recall: expected ? hit / expected : 0,
      staleRate: total ? stale / total : 0,
      irrelevantFalsePositiveRate: irrelevantTasks
        ? irrelevantFalsePositives / irrelevantTasks
        : 0,
      contextEstimate: cost,
      latencyMs: Math.round(performance.now() - start),
      categoryRecall: Object.fromEntries(
        Object.entries(categoryStats)
          .filter(([, stats]) => stats.expected > 0)
          .map(([category, stats]) => [category, stats.hits / stats.expected]),
      ),
      categoryFalsePositiveRate: Object.fromEntries(
        Object.entries(categoryStats)
          .filter(([, stats]) => stats.expected === 0)
          .map(([category, stats]) => [
            category,
            stats.tasks ? stats.falsePositiveTasks / stats.tasks : 0,
          ]),
      ),
      taskOutcomes: "retrieval fixture only; no agent model used",
    }),
  );
}
