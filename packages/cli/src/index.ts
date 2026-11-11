import { connect } from "../../adapters/src/index.js";
import { parseArgs } from "node:util";
import {
  existsSync,
  readFileSync,
  appendFileSync,
  realpathSync,
} from "node:fs";
import { resolve, join, isAbsolute } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  schema,
  defaults,
  root,
  load,
  effective,
  userDefaults,
  saveUser,
  atomic,
  configPath,
  database,
} from "./config.js";
import { SqliteStore } from "../../storage-sqlite/src/index.js";
import { Service } from "../../core/src/service.js";
import { serve } from "../../mcp/src/index.js";
import { providerRegistry } from "../../core/src/providers.js";
const { positionals: p, values: v } = parseArgs({
  allowPositionals: true,
  options: {
    component: { type: "string" },
    status: { type: "string" },
    pinned: { type: "string" },
    "expires-at": { type: "string" },
    input: { type: "string" },
    environment: { type: "string" },
    workspace: { type: "string" },
    project: { type: "string" },
    kind: { type: "string" },
    content: { type: "string" },
    source: { type: "string" },
    budget: { type: "string" },
    "expected-revision": { type: "string" },
    transport: { type: "string" },
    scope: { type: "string" },
    json: { type: "boolean" },
    "dry-run": { type: "boolean" },
  },
});
const output = (x: unknown) => console.log(JSON.stringify(x, null, 2));
async function main() {
  const command = p[0];
  let base = resolve(String(v.project ?? process.cwd()));
  if (command === "init") {
    base = realpathSync(base);
    if (!existsSync(configPath(base))) atomic(configPath(base), defaults());
    const c = load(base);
    new SqliteStore(database(base, c)).close();
    const ignore = join(base, ".gitignore");
    const old = existsSync(ignore) ? readFileSync(ignore, "utf8") : "";
    for (const rule of [
      ".hippocampus/*.sqlite",
      ".hippocampus/*.sqlite-*",
      ".hippocampus/local.json",
    ])
      if (!old.split("\n").includes(rule))
        appendFileSync(ignore, "\n" + rule + "\n");
    output({ project: base, projectId: c.projectId });
    return;
  }
  if (!command || command === "help") {
    console.log(
      "hippocampus init | config [show|get|set|validate|test] | remember | recall | memories | inspect | revise | forget | doctor | serve | connect",
    );
    return;
  }
  if (command === "config" && v.scope === "user") {
    const user = userDefaults();
    if (p[1] === "show") {
      output(user);
      return;
    }
    if (p[1] === "validate") {
      output({ valid: true });
      return;
    }
    if (p[1] === "set") {
      const keys = (p[2] ?? "").split(".");
      if (
        keys.includes("projectId") ||
        keys.some((k) => ["__proto__", "constructor", "prototype"].includes(k))
      )
        throw Error("Invalid user field");
      let target: any = user;
      for (const key of keys.slice(0, -1)) {
        target[key] ??= {};
        target = target[key];
      }
      let value: any = p[3];
      try {
        value = JSON.parse(value);
      } catch {}
      target[keys.at(-1)!] = value;
      saveUser(user);
      output(user);
      return;
    }
    if (p[1] === "get") {
      let value: any = user;
      for (const key of (p[2] ?? "").split(".")) value = value?.[key];
      if (value === undefined) throw Error("No user override for field");
      output(value);
      return;
    }
    if (!p[1]) {
      if (!process.stdin.isTTY)
        throw Error(
          "Interactive config requires a TTY; use config show/get/set/validate --scope user",
        );
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      try {
        console.log(
          "User defaults apply before project configuration. SQLite remains the canonical store.",
        );
        const budget = await rl.question("Default context budget [1500]: ");
        const next = {
          ...user,
          retrieval: {
            ...((user.retrieval as object) ?? {}),
            maxContextTokens: budget ? Number(budget) : 1500,
          },
        };
        output(next);
        if ((await rl.question("Save? [y/N] ")).toLowerCase() === "y")
          saveUser(next);
      } finally {
        rl.close();
      }
      return;
    }
    throw Error("Use config show/get/set/validate --scope user");
  }
  base = root(base);
  const c = effective(base);
  if (command === "config") {
    if (v.scope && v.scope !== "project")
      throw Error("Unsupported configuration scope");
    if (p[1] === "show") {
      output(c);
      return;
    }
    if (p[1] === "validate") {
      output({ valid: true });
      return;
    }
    if (p[1] === "get") {
      let x: any = c;
      for (const key of (p[2] ?? "").split(".")) x = x?.[key];
      if (x === undefined) throw Error("Unknown configuration field");
      output(x);
      return;
    }
    if (p[1] === "set") {
      const candidate = load(base);
      const keys = (p[2] ?? "").split(".");
      if (
        keys.some((k) => ["__proto__", "constructor", "prototype"].includes(k))
      )
        throw Error("Invalid field");
      let target: any = candidate;
      for (const key of keys.slice(0, -1)) {
        if (!target[key]) throw Error("Unknown field");
        target = target[key];
      }
      let value: any = p[3];
      try {
        value = JSON.parse(value);
      } catch {}
      target[keys.at(-1)!] = value;
      const next = schema.parse(candidate);
      if (next.projectId !== c.projectId)
        throw Error("Project identity cannot be changed");
      if (database(base, next) !== database(base, c)) {
        const store = new SqliteStore(database(base, c));
        const count = store.list(c.projectId).length;
        store.close();
        if (count)
          throw Error(
            "Cannot change a nonempty store path; store migration is not implemented",
          );
      }
      atomic(configPath(base), next);
      output(next);
      return;
    }
    if (!p[1]) {
      if (!process.stdin.isTTY)
        throw Error(
          "Interactive config requires a TTY; use config show/get/set/validate/test",
        );
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      try {
        console.log(
          "SQLite is the canonical store; FTS5 is the retrieval index. Vector providers are planned.",
        );
        const budget = await rl.question("Context budget [1500]: ");
        const next = schema.parse({
          ...c,
          retrieval: {
            ...c.retrieval,
            maxContextTokens: budget ? Number(budget) : 1500,
          },
        });
        output(next);
        if ((await rl.question("Save? [y/N] ")).toLowerCase() === "y")
          atomic(configPath(base), next);
      } finally {
        rl.close();
      }
      return;
    }
  }
  if (command === "connect" || command === "disconnect") {
    output(
      connect(
        p[1] ?? "",
        base,
        resolve(process.argv[1]!),
        v.scope ?? "project",
        v["dry-run"] ?? false,
        command === "disconnect",
      ),
    );
    return;
  }
  const store = new SqliteStore(database(base, c));
  const service = new Service(store, c.projectId);
  if (command === "serve") {
    if (typeof v.project !== "string" || !isAbsolute(v.project))
      throw Error("serve requires an absolute --project path");
    if (v.transport && v.transport !== "stdio")
      throw Error("Only stdio is supported");
    const snapshot = JSON.stringify(c);
    await serve(service, () => {
      if (JSON.stringify(effective(base)) !== snapshot)
        throw Error("Configuration changed; restart MCP server");
    });
    return;
  }
  try {
    switch (command) {
      case "config":
        if (p[1] !== "test") throw Error("Unknown config command");
        output({ connected: true, provider: "sqlite" });
        break;
      case "remember":
        if (v.input) {
          const raw = readFileSync(resolve(v.input), "utf8");
          if (Buffer.byteLength(raw) > 32000)
            throw Error("Input file exceeds 32KB");
          output(service.remember(JSON.parse(raw)));
          break;
        }
        output(
          service.remember({
            kind: v.kind as any,
            content: String(v.content ?? ""),
            evidence: v.source
              ? [{ type: "other", reference: String(v.source) }]
              : [],
          }),
        );
        break;
      case "recall":
        output(
          service.recall(
            p[1] ?? "",
            Number(v.budget ?? c.retrieval.maxContextTokens),
            v.environment,
            v.workspace,
            v.component,
          ),
        );
        break;
      case "memories":
        output(store.list(c.projectId));
        break;
      case "inspect":
        output(service.inspect(p[1] ?? ""));
        break;
      case "revise":
        output(
          service.revise(
            p[1] ?? "",
            v.content,
            Number(v["expected-revision"]),
            {
              ...(v.status ? { status: v.status as any } : {}),
              ...(v.pinned ? { pinned: v.pinned === "true" } : {}),
              ...(v["expires-at"] ? { expiresAt: v["expires-at"] } : {}),
            },
          ),
        );
        break;
      case "forget":
        output(service.forget(p[1] ?? ""));
        break;
      case "doctor":
        output({
          projectId: c.projectId,
          database: database(base, c),
          providers: providerRegistry,
          telemetry: false,
        });
        break;
      case "consolidate":
        if (!v["dry-run"]) throw Error("Only review previews are supported");
        output({
          proposals: store
            .list(c.projectId)
            .filter(
              (m) => m.expiresAt && m.expiresAt < new Date().toISOString(),
            )
            .map((m) => ({ id: m.id, action: "review expiry" })),
        });
        break;
      default:
        throw Error("Unknown command");
    }
  } finally {
    store.close();
  }
}
main().catch((e) => {
  console.error(
    JSON.stringify({ code: e.code ?? "INVALID_INPUT", message: e.message }),
  );
  process.exitCode = e.code === "REVISION_CONFLICT" ? 3 : 1;
});
