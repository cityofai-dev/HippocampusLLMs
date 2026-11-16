import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
const { values } = parseArgs({
  options: {
    project: { type: "string" },
    output: { type: "string" },
    "dry-run": { type: "boolean" },
  },
});
if (!values.project || !values.output)
  throw Error("Use --project ABSOLUTE_PATH --output NEW_DIRECTORY");
for (const host of ["claude", "codex"])
  if (existsSync(join(values.output, host)))
    throw Error("Choose a fresh output directory");
for (const host of ["claude", "codex"]) {
  const args = [
    resolve("packages/cli/dist/index.js"),
    "plugin",
    "build",
    host,
    "--project",
    values.project,
    "--output",
    resolve(values.output, host),
  ];
  if (values["dry-run"]) args.push("--dry-run");
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  if (result.status !== 0) throw Error(result.stderr);
  process.stdout.write(result.stdout);
}
