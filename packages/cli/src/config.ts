import { homedir } from "node:os";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  realpathSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
export const schema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: z.string().uuid(),
    storage: z
      .object({
        provider: z.literal("sqlite"),
        sqlite: z.object({ path: z.string().min(1) }).strict(),
      })
      .strict(),
    retrieval: z
      .object({
        mode: z.literal("lexical"),
        maxContextTokens: z.number().int().min(100).max(10000),
        vector: z.object({ provider: z.literal("none") }).strict(),
      })
      .strict(),
    embeddings: z.object({ provider: z.literal("none") }).strict(),
    capture: z.object({ mode: z.literal("explicit") }).strict(),
    privacy: z.object({ telemetry: z.literal(false) }).strict(),
  })
  .strict();
export type Config = z.infer<typeof schema>;
export function defaults(): Config {
  return {
    schemaVersion: 1,
    projectId: randomUUID(),
    storage: { provider: "sqlite", sqlite: { path: "./memory.sqlite" } },
    retrieval: {
      mode: "lexical",
      maxContextTokens: 1500,
      vector: { provider: "none" },
    },
    embeddings: { provider: "none" },
    capture: { mode: "explicit" },
    privacy: { telemetry: false },
  };
}
export function root(path: string): string {
  let p = realpathSync(resolve(path));
  while (!existsSync(join(p, ".hippocampus/config.json"))) {
    const next = dirname(p);
    if (next === p)
      throw Error("Project not initialized; run hippocampus init");
    p = next;
  }
  return p;
}
export function configPath(p: string) {
  return join(p, ".hippocampus/config.json");
}
export function load(p: string): Config {
  return schema.parse(JSON.parse(readFileSync(configPath(p), "utf8")));
}
export function atomic(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = path + "." + randomUUID() + ".tmp";
  writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  renameSync(temp, path);
}
export function database(p: string, c: Config) {
  return resolve(dirname(configPath(p)), c.storage.sqlite.path);
}
export function userConfigPath() {
  return join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "hippocampus",
    "config.json",
  );
}
function merge(a: any, b: any): any {
  const result = structuredClone(a);
  for (const [key, value] of Object.entries(b)) {
    result[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? merge(result[key] ?? {}, value)
        : value;
  }
  return result;
}
export function userDefaults(): Record<string, unknown> {
  const path = userConfigPath();
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if ("projectId" in raw) throw Error("User defaults cannot contain projectId");
  schema.parse(merge(defaults(), raw));
  return raw;
}
export function effective(p: string): Config {
  const raw = JSON.parse(readFileSync(configPath(p), "utf8"));
  schema.parse(raw);
  const result = merge(merge(defaults(), userDefaults()), raw);
  if (process.env.HIPPOCAMPUS_MAX_CONTEXT_TOKENS)
    result.retrieval.maxContextTokens = Number(
      process.env.HIPPOCAMPUS_MAX_CONTEXT_TOKENS,
    );
  return schema.parse(result);
}
export function saveUser(raw: Record<string, unknown>) {
  if ("projectId" in raw) throw Error("User defaults cannot contain projectId");
  schema.parse(merge(defaults(), raw));
  atomic(userConfigPath(), raw);
}
