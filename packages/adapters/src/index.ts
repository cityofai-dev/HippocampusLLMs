import {
  existsSync,
  readFileSync,
  copyFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
export interface HostCapabilities {
  mcp: boolean;
  cli: boolean;
  taskStartHook: boolean;
  taskEndHook: boolean;
  eventCapture: boolean;
}
export const capabilities: HostCapabilities = {
  mcp: true,
  cli: true,
  taskStartHook: false,
  taskEndHook: false,
  eventCapture: false,
};
const begin = "# BEGIN HIPPOCAMPUS MANAGED";
const end = "# END HIPPOCAMPUS MANAGED";
export function connect(
  host: string,
  project: string,
  entry: string,
  scope: string,
  dryRun: boolean,
  remove = false,
) {
  if (!["claude", "codex"].includes(host))
    throw Error("Supported hosts: claude, codex");
  if (!["project", "user"].includes(scope))
    throw Error("Scope must be project or user");
  if (host === "claude" && scope === "user")
    return {
      host,
      manual: true,
      command: [
        "claude",
        "mcp",
        "add",
        "--transport",
        "stdio",
        "--scope",
        "user",
        "hippocampus",
        "--",
        process.execPath,
        entry,
        "serve",
        "--transport",
        "stdio",
        "--project",
        project,
      ],
      reason:
        "Claude user configuration is managed by the Claude CLI. Review this argument array before running it.",
    };
  const path =
    host === "claude"
      ? join(project, ".mcp.json")
      : join(
          scope === "user"
            ? join(homedir(), ".codex")
            : join(project, ".codex"),
          "config.toml",
        );
  const old = existsSync(path) ? readFileSync(path, "utf8") : "";
  const launch = {
    command: process.execPath,
    args: [entry, "serve", "--transport", "stdio", "--project", project],
  };
  let next: string;
  if (host === "claude") {
    const document = old ? JSON.parse(old) : {};
    document.mcpServers ??= {};
    const existing = document.mcpServers.hippocampus;
    const owner = join(project, ".hippocampus/claude-connection.json");
    const owned = existsSync(owner)
      ? JSON.parse(readFileSync(owner, "utf8"))
      : undefined;
    if (existing && JSON.stringify(existing) !== JSON.stringify(owned?.entry))
      throw Error(
        "Existing hippocampus server is not owned by this adapter; preserve it and choose manual setup",
      );
    if (remove) delete document.mcpServers.hippocampus;
    else document.mcpServers.hippocampus = launch;
    next = JSON.stringify(document, null, 2) + "\n";
    if (!dryRun) {
      mkdirSync(dirname(path), { recursive: true });
      if (old && !existsSync(path + ".hippocampus.bak"))
        copyFileSync(path, path + ".hippocampus.bak");
      writeFileSync(path, next);
      writeFileSync(owner, JSON.stringify({ entry: remove ? null : launch }));
    }
  } else {
    const start = old.indexOf(begin);
    const stop = old.indexOf(end);
    if (start < 0 !== stop < 0)
      throw Error("Incomplete managed configuration block; restore backup");
    const unowned =
      start < 0 ? old : old.slice(0, start) + old.slice(stop + end.length);
    if (/\[mcp_servers\.(?:"hippocampus"|hippocampus)\]/.test(unowned))
      throw Error(
        "Existing hippocampus configuration is not managed by this adapter",
      );
    const block = `${begin}\n[mcp_servers.hippocampus]\ncommand = ${JSON.stringify(launch.command)}\nargs = ${JSON.stringify(launch.args)}\n${end}`;
    next = remove ? unowned : unowned.trimEnd() + "\n\n" + block + "\n";
    if (!dryRun) {
      mkdirSync(dirname(path), { recursive: true });
      if (old && !existsSync(path + ".hippocampus.bak"))
        copyFileSync(path, path + ".hippocampus.bak");
      writeFileSync(path, next);
    }
  }
  return {
    host,
    scope,
    path,
    dryRun,
    before: old,
    after: next,
    backup: path + ".hippocampus.bak",
    capabilities,
    trigger: "manual or agent-instructed",
  };
}
