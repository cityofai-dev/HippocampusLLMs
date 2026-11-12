import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const bin = resolve("packages/cli/dist/index.js");
function run(dir, args, ok = true) {
  const r = spawnSync(process.execPath, [bin, ...args, "--project", dir], {
    encoding: "utf8",
  });
  if (ok) assert.equal(r.status, 0, r.stderr);
  else assert.notEqual(r.status, 0);
  return ok ? JSON.parse(r.stdout) : r;
}
function project() {
  const dir = mkdtempSync(join(tmpdir(), "hippocampus space "));
  run(dir, ["init"]);
  return dir;
}
test("independent sessions persist, recall, reject stale revisions and delete", () => {
  const dir = project();
  const m = run(dir, [
    "remember",
    "--kind",
    "decision",
    "--content",
    "Refresh tokens require an atomic database transaction",
    "--source",
    "user decision",
  ]);
  assert.equal(run(dir, ["recall", "refresh tokens"]).memories[0].id, m.id);
  assert.equal(run(dir, ["recall", "unrelated gardening"]).memories.length, 0);
  const revised = run(dir, [
    "revise",
    m.id,
    "--content",
    "Refresh tokens require serializable database transactions",
    "--expected-revision",
    "1",
  ]);
  assert.equal(revised.revision, 2);
  run(
    dir,
    [
      "revise",
      m.id,
      "--content",
      "Stale update must fail",
      "--expected-revision",
      "1",
    ],
    false,
  );
  const other = project();
  assert.equal(run(other, ["memories"]).length, 0);
  run(other, ["inspect", m.id], false);
  run(dir, ["forget", m.id]);
  assert.equal(run(dir, ["recall", "refresh tokens"]).memories.length, 0);
});
test("configuration stays valid and rejects unsupported providers and non-TTY wizard", () => {
  const dir = project();
  const path = join(dir, ".hippocampus/config.json");
  const before = readFileSync(path, "utf8");
  run(dir, ["config", "set", "storage.provider", "qdrant"], false);
  assert.equal(readFileSync(path, "utf8"), before);
  run(dir, ["config"], false);
  run(dir, ["config", "set", "retrieval.maxContextTokens", "300"]);
  assert.equal(run(dir, ["config", "get", "retrieval.maxContextTokens"]), 300);
  run(dir, ["init"]);
  assert.equal(
    JSON.parse(before).projectId,
    run(dir, ["config", "show"]).projectId,
  );
});
test("serialized recall respects conservative budget", () => {
  const dir = project();
  for (let i = 0; i < 5; i++)
    run(dir, [
      "remember",
      "--kind",
      "episode",
      "--content",
      `Refresh token version ${i} had a reproducible transaction failure`,
    ]);
  const result = run(dir, ["recall", "refresh token", "--budget", "150"]);
  assert.ok(Math.ceil(Buffer.byteLength(JSON.stringify(result)) / 3) <= 150);
});
test("adapters preserve unrelated configuration and own only their entries", () => {
  const dir = project();
  run(dir, ["connect", "claude", "--dry-run"]);
  run(dir, ["connect", "claude"]);
  run(dir, ["connect", "claude"]);
  const config = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
  assert.ok(config.mcpServers.hippocampus);
  run(dir, ["disconnect", "claude"]);
  assert.deepEqual(
    JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")).mcpServers,
    {},
  );
  run(dir, ["connect", "codex"]);
  const first = readFileSync(join(dir, ".codex/config.toml"), "utf8");
  run(dir, ["connect", "codex"]);
  assert.equal(readFileSync(join(dir, ".codex/config.toml"), "utf8"), first);
  run(dir, ["disconnect", "codex"]);
  assert.ok(
    !readFileSync(join(dir, ".codex/config.toml"), "utf8").includes(
      "[mcp_servers.hippocampus]",
    ),
  );
});
test("parallel writers reject a stale update without loss", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execute = promisify(execFile);
  const dir = project();
  const m = run(dir, [
    "remember",
    "--kind",
    "decision",
    "--content",
    "Concurrent token updates require optimistic revisions",
  ]);
  const results = await Promise.allSettled(
    [
      "First concurrent transaction wins",
      "Second concurrent transaction wins",
    ].map((content) =>
      execute(process.execPath, [
        bin,
        "revise",
        m.id,
        "--content",
        content,
        "--expected-revision",
        "1",
        "--project",
        dir,
      ]),
    ),
  );
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(run(dir, ["inspect", m.id]).revision, 2);
});
test("restricted environment and archival never enter default recall", () => {
  const dir = project();
  const input = join(dir, "event.json");
  writeFileSync(
    input,
    JSON.stringify({
      kind: "constraint",
      content: "Production refresh tokens require isolation",
      applicability: { environments: ["production"] },
    }),
  );
  const m = run(dir, ["remember", "--input", input]);
  assert.equal(run(dir, ["recall", "refresh tokens"]).memories.length, 0);
  assert.equal(
    run(dir, ["recall", "refresh tokens", "--environment", "production"])
      .memories.length,
    1,
  );
  run(dir, [
    "revise",
    m.id,
    "--status",
    "archived",
    "--expected-revision",
    "1",
  ]);
  assert.equal(
    run(dir, ["recall", "refresh tokens", "--environment", "production"])
      .memories.length,
    0,
  );
});
test("configuration environment precedence and user identity protection", () => {
  const dir = project();
  const result = spawnSync(
    process.execPath,
    [bin, "config", "show", "--project", dir],
    {
      encoding: "utf8",
      env: { ...process.env, HIPPOCAMPUS_MAX_CONTEXT_TOKENS: "321" },
    },
  );
  assert.equal(JSON.parse(result.stdout).retrieval.maxContextTokens, 321);
  const user = spawnSync(
    process.execPath,
    [
      bin,
      "config",
      "set",
      "projectId",
      "c4fc7ce1-28c1-468c-a110-632552c36922",
      "--scope",
      "user",
    ],
    { encoding: "utf8", env: { ...process.env, XDG_CONFIG_HOME: dir } },
  );
  assert.notEqual(user.status, 0);
});
test("vector and hybrid modes index existing memories and follow revisions", () => {
  const dir = project();
  const old = run(dir, [
    "remember",
    "--kind",
    "decision",
    "--content",
    "Refresh token rotation requires atomic database transactions",
  ]);
  assert.equal(
    run(dir, ["config", "preset", "hybrid"]).retrieval.mode,
    "hybrid",
  );
  assert.equal(run(dir, ["recall", "gardening flowers"]).memories.length, 0);
  let results = run(dir, ["recall", "refresh token"]);
  assert.equal(results.memories[0].id, old.id);
  assert.match(results.memories[0].reason, /lexical\+vector/);
  assert.equal(
    run(dir, ["config", "preset", "vector"]).retrieval.mode,
    "vector",
  );
  assert.equal(run(dir, ["recall", "gardening flowers"]).memories.length, 0);
  results = run(dir, ["recall", "refresh token"]);
  assert.equal(results.memories[0].id, old.id);
  assert.match(results.memories[0].reason, /vector match/);
  run(dir, [
    "revise",
    old.id,
    "--content",
    "Database transactions require atomic commits",
    "--expected-revision",
    "1",
  ]);
  assert.equal(run(dir, ["recall", "refresh token"]).memories.length, 0);
  assert.equal(run(dir, ["recall", "atomic commits"]).memories[0].id, old.id);
  run(dir, ["forget", old.id]);
  assert.equal(run(dir, ["recall", "atomic commits"]).memories.length, 0);
});
test("invalid vector combinations leave configuration unchanged", () => {
  const dir = project();
  const path = join(dir, ".hippocampus/config.json");
  const before = readFileSync(path, "utf8");
  run(dir, ["config", "set", "retrieval.mode", "vector"], false);
  assert.equal(readFileSync(path, "utf8"), before);
  assert.equal(
    run(dir, ["config", "preset", "lexical"]).retrieval.vector.provider,
    "none",
  );
});
test("local vectors keep project and applicability boundaries and budget", () => {
  const first = project(),
    second = project();
  run(first, ["config", "preset", "vector"]);
  run(second, ["config", "preset", "vector"]);
  const event = join(first, "vector-event.json");
  writeFileSync(
    event,
    JSON.stringify({
      kind: "constraint",
      content: "Production token rotation requires atomic commits",
      applicability: { environments: ["production"] },
    }),
  );
  run(first, ["remember", "--input", event]);
  assert.equal(run(first, ["recall", "token rotation"]).memories.length, 0);
  assert.equal(
    run(first, ["recall", "token rotation", "--environment", "production"])
      .memories.length,
    1,
  );
  assert.equal(
    run(second, ["recall", "token rotation", "--environment", "production"])
      .memories.length,
    0,
  );
  const bounded = run(first, [
    "recall",
    "token rotation",
    "--environment",
    "production",
    "--budget",
    "180",
  ]);
  assert.ok(Math.ceil(Buffer.byteLength(JSON.stringify(bounded)) / 3) <= 180);
});
