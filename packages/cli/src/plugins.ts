import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  readdirSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "../../core/src/model.js";

export function pluginAction(
  action: string,
  host: string,
  project: string,
  output: string | undefined,
  dryRun: boolean,
) {
  if (!["claude", "codex"].includes(host))
    throw new AppError("INVALID_INPUT", "Choose claude or codex");
  const destination = resolve(
    output ?? join(project, ".hippocampus/plugins", host),
  );
  const ownerFile = join(destination, "hippocampus-owned.json");
  if (action === "remove") {
    const owned = JSON.parse(readFileSync(ownerFile, "utf8"));
    if (owned.project !== project || owned.host !== host)
      throw new AppError(
        "INVALID_INPUT",
        "Artifact belongs to another project/host",
      );
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const expected = new Set(
      owned.files.map((p: string) => resolve(destination, p)),
    );
    expected.add(ownerFile);
    const actual = walk(destination);
    if (actual.some((p) => !expected.has(p)))
      throw new AppError(
        "INVALID_INPUT",
        "Unowned files exist; refusing removal",
      );
    const preview = {
      action,
      host,
      project,
      destination,
      files: actual,
      retains: "Project memories and shared runtime snapshots",
    };
    if (!dryRun) rmSync(destination, { recursive: true });
    return { ...preview, dryRun };
  }
  if (action !== "build")
    throw new AppError("INVALID_INPUT", "Use plugin build|remove claude|codex");
  if (existsSync(destination))
    throw new AppError(
      "INVALID_INPUT",
      "Artifact already exists; choose fresh --output or remove owned artifact first",
    );
  const runtimeDirectory = dirname(fileURLToPath(import.meta.url));
  const runtime = readFileSync(join(runtimeDirectory, "plugin-runtime.mjs"));
  const digest = createHash("sha256").update(runtime).digest("hex");
  const runtimePath = join(
    project,
    ".hippocampus/plugin-runtimes",
    digest + ".mjs",
  );
  const files: Record<string, string | Buffer> = {
    [`.${host}-plugin/plugin.json`]: JSON.stringify(
      {
        name: "hippocampus",
        version: "0.3.0",
        description: "Selective local project memory",
        author: { name: "HippocampusLLMs contributors" },
        license: "MIT",
        ...(host === "codex"
          ? { skills: "./skills/", mcpServers: "./.mcp.json" }
          : {}),
      },
      null,
      2,
    ),
    ".mcp.json": JSON.stringify(
      {
        mcpServers: {
          hippocampus: {
            command: process.execPath,
            args: [
              runtimePath,
              "serve",
              "--transport",
              "stdio",
              "--project",
              project,
            ],
          },
        },
      },
      null,
      2,
    ),
    "skills/project-memory/SKILL.md": readFileSync(
      join(runtimeDirectory, "project-memory.md"),
      "utf8",
    ),
    "runtime/plugin-runtime.mjs": runtime,
    LICENSE: readFileSync(join(runtimeDirectory, "LICENSE"), "utf8"),
    "README.md": `# Hippocampus project memory\n\nThis plugin provides project memory through a bundled local MCP runtime and a skill for selective recall and explicit capture. It is bound to ${project}. The runtime is snapshotted into the project's ignored .hippocampus/plugin-runtimes directory, independent of the source checkout and plugin cache. Keep Node 24+ and the selected project available. It enables no automatic transcript capture.\n\nPreview removal with hippocampus plugin remove ${host} --project ${JSON.stringify(project)} --output ${JSON.stringify(destination)} --dry-run. Remove the client plugin before deleting artifacts. Project memories remain intact.\n`,
  };
  if (host === "codex")
    files[".agents/plugins/marketplace.json"] = JSON.stringify(
      {
        name: "hippocampus-local",
        plugins: [
          {
            name: "hippocampus",
            source: { source: "local", path: "./" },
            policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
            category: "Productivity",
          },
        ],
      },
      null,
      2,
    );
  const preview = {
    action,
    host,
    project,
    destination,
    runtimePath,
    node: process.execPath,
    files: Object.keys(files),
    install:
      host === "claude"
        ? ["claude", "--plugin-dir", destination]
        : [
            ["codex", "plugin", "marketplace", "add", destination],
            ["codex", "plugin", "add", "hippocampus@hippocampus-local"],
          ],
    uninstall:
      host === "claude"
        ? "Omit --plugin-dir on next invocation"
        : "codex plugin remove hippocampus@hippocampus-local",
    modifiesClientSettings: false,
  };
  if (dryRun) return { ...preview, dryRun };
  const staging = destination + ".tmp-" + process.pid;
  if (existsSync(staging))
    throw new AppError("INVALID_INPUT", "Staging directory exists");
  mkdirSync(staging, { recursive: true });
  try {
    for (const [name, body] of Object.entries(files)) {
      const target = join(staging, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, body);
    }
    writeFileSync(
      join(staging, "hippocampus-owned.json"),
      JSON.stringify({ project, host, files: Object.keys(files) }),
    );
    mkdirSync(dirname(runtimePath), { recursive: true });
    if (!existsSync(runtimePath))
      writeFileSync(runtimePath, runtime, { flag: "wx" });
    else if (
      createHash("sha256").update(readFileSync(runtimePath)).digest("hex") !==
      digest
    )
      throw Error("Runtime snapshot integrity check failed");
    renameSync(staging, destination);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  const ignore = join(project, ".gitignore");
  const existing = existsSync(ignore) ? readFileSync(ignore, "utf8") : "";
  for (const rule of [".hippocampus/plugin-runtimes/", ".hippocampus/plugins/"])
    if (!existing.split("\n").includes(rule))
      appendFileSync(ignore, "\n" + rule + "\n");
  return { ...preview, dryRun };
}
