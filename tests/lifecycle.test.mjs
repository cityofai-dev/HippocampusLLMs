import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const cli = resolve("packages/cli/dist/index.js");
function setup() {
  const project = mkdtempSync(join(tmpdir(), "hippo review "));
  let n = 0;
  const run = (...args) => {
    const r = spawnSync(
      process.execPath,
      [cli, ...args, "--project", project],
      { encoding: "utf8" },
    );
    if (r.status !== 0) throw Error(r.stderr);
    return JSON.parse(r.stdout);
  };
  const input = (command, value, ...args) => {
    const file = join(project, `event-${n++}.json`);
    writeFileSync(file, JSON.stringify(value));
    return run(command, ...args, "--input", file);
  };
  const call = (name, value) => input("call", value, "hippocampus_" + name);
  run("init");
  return { project, run, input, call };
}
test("proposals remain outside recall, preview changes, accept once, reject and preserve stale drafts", () => {
  const { run, call } = setup();
  const p = call("propose", {
    memory: {
      kind: "decision",
      content: "Refresh token rotation requires database row locks",
      rationale: "Concurrent requests consume one token",
    },
  });
  assert.equal(run("recall", "Refresh token rotation").memories.length, 0);
  assert.equal(run("inbox").proposals.length, 1);
  assert.equal(run("review", "inspect", p.id).diff.before, null);
  run("review", "accept", p.id, "--dry-run");
  assert.equal(run("inbox").proposals.length, 1);
  const accepted = call("review", {
    id: p.id,
    action: "accept",
    expectedRevision: 1,
  }).memory;
  assert.equal(run("inbox").proposals.length, 0);
  assert.throws(
    () => call("review", { id: p.id, action: "accept", expectedRevision: 1 }),
    /NOT_FOUND/,
  );
  const correction = call("propose", {
    targetId: accepted.id,
    expectedRevision: 1,
    memory: {
      kind: "decision",
      content: "Refresh token rotation requires serializable row locks",
    },
  });
  assert.equal(
    run("review", "inspect", correction.id).diff.before.content,
    accepted.content,
  );
  call("revise", {
    id: accepted.id,
    expectedRevision: 1,
    content: "Refresh token rotation requires transaction row locks",
  });
  assert.equal(run("review", "inspect", correction.id).stale, true);
  assert.throws(
    () =>
      call("review", {
        id: correction.id,
        action: "accept",
        expectedRevision: 1,
      }),
    /REVISION_CONFLICT/,
  );
  assert.equal(run("inbox").proposals.length, 1);
  call("review", { id: correction.id, action: "reject", expectedRevision: 1 });
  assert.equal(run("inbox").proposals.length, 0);
});
test("forget purges pending corrections and derived candidate content", () => {
  const { run, call } = setup();
  const m = call("remember", {
    kind: "decision",
    content: "Payment retries require request idempotency",
  });
  call("propose", {
    targetId: m.id,
    expectedRevision: 1,
    memory: {
      kind: "decision",
      content: "Payment retries require invoice idempotency",
    },
  });
  call("propose", {
    memory: {
      kind: "procedure",
      content: "Derived payment retry procedure uses request IDs",
      relations: [{ type: "derived_from", targetId: m.id }],
    },
  });
  run("forget", m.id);
  assert.equal(run("inbox").proposals.length, 0);
});
test("evidence snapshots detect drift without changing verification and reject path escapes", () => {
  const { project, run, call } = setup();
  const path = join(project, "auth.js");
  writeFileSync(path, "export const retry = 2;");
  const event = {
    kind: "decision",
    content: "Auth refresh retries are limited to two attempts",
    verification: "observed",
    evidence: [{ type: "path", reference: "auth.js" }],
    idempotencyKey: "auth-retry",
  };
  const m = call("remember", event);
  assert.match(m.evidence[0].contentHash, /^sha256:/);
  assert.equal(call("remember", event).id, m.id);
  assert.equal(run("inspect", m.id).evidenceFreshness[0].state, "current");
  writeFileSync(path, "export const retry = 3;");
  const result = run("recall", "Auth refresh retries");
  assert.equal(result.memories[0].evidenceFreshness[0].state, "changed");
  assert.equal(result.memories[0].verification, "observed");
  assert.equal(run("inbox").evidenceReviews[0].id, m.id);
  assert.throws(() => call("remember", event), /IDEMPOTENCY_CONFLICT/);
  const outside = call("remember", {
    kind: "constraint",
    content: "Outside path references remain untrusted evidence",
    evidence: [{ type: "path", reference: "../outside-secret" }],
  });
  assert.equal(
    run("inspect", outside.id).evidenceFreshness[0].contentHash,
    undefined,
  );
  if (process.platform !== "win32") {
    symlinkSync(tmpdir(), join(project, "escape"));
    const link = call("remember", {
      kind: "constraint",
      content: "Symlink evidence cannot escape project boundaries",
      evidence: [{ type: "path", reference: "escape" }],
    });
    assert.equal(
      run("inspect", link.id).evidenceFreshness[0].state,
      "unsupported",
    );
  }
});
test("explanations include exclusion reasons, contradiction IDs and obey the serialized budget", () => {
  const { call, run } = setup();
  const a = call("remember", {
    kind: "decision",
    content: "Refresh retry policy permits two attempts",
  });
  const b = call("remember", {
    kind: "decision",
    content: "Refresh retry policy permits three attempts",
    relations: [{ type: "contradicts", targetId: a.id }],
  });
  call("remember", {
    kind: "constraint",
    content: "Refresh retry policy production restriction",
    applicability: { environments: ["production"] },
  });
  const result = run(
    "recall",
    "Refresh retry policy",
    "--explain",
    "--budget",
    "1500",
  );
  assert.ok(
    result.explanations.some((e) => e.reason === "environment_mismatch"),
  );
  assert.ok(
    result.memories.some(
      (m) => m.id === b.id && m.contradictions[0].id === a.id,
    ),
  );
  assert.ok(Math.ceil(Buffer.byteLength(JSON.stringify(result)) / 3) <= 1500);
  for (const budget of [100, 200, 400]) {
    const bounded = run(
      "recall",
      "Refresh retry policy",
      "--explain",
      "--budget",
      String(budget),
    );
    assert.ok(
      Math.ceil(Buffer.byteLength(JSON.stringify(bounded)) / 3) <= budget,
    );
  }
});
test("plugin preview is read-only, runtime is standalone, removal preserves memory and rejects unowned files", () => {
  const { project, run, call } = setup();
  const output = join(project, "plugin bundle");
  const preview = run(
    "plugin",
    "build",
    "codex",
    "--output",
    output,
    "--dry-run",
  );
  assert.equal(existsSync(output), false);
  assert.equal(existsSync(preview.runtimePath), false);
  const built = run("plugin", "build", "codex", "--output", output);
  assert.ok(!built.runtimePath.includes("HippocampusLLMs/packages"));
  const doctor = spawnSync(
    process.execPath,
    [built.runtimePath, "doctor", "--project", project],
    { cwd: tmpdir(), encoding: "utf8" },
  );
  assert.equal(doctor.status, 0, doctor.stderr);
  const m = call("remember", {
    kind: "constraint",
    content: "Removing plugins preserves canonical project memory",
  });
  writeFileSync(join(output, "unowned.txt"), "keep");
  assert.throws(
    () => run("plugin", "remove", "codex", "--output", output),
    /Unowned/,
  );
  // Removing the file we just created leaves precisely the owned artifact.
  unlinkSync(join(output, "unowned.txt"));
  run("plugin", "remove", "codex", "--output", output, "--dry-run");
  assert.ok(existsSync(output));
  run("plugin", "remove", "codex", "--output", output);
  assert.equal(existsSync(output), false);
  assert.equal(run("inspect", m.id).content, m.content);
});

test("migration 2 to 3 preserves canonical data and adds an isolated review queue", async () => {
  const { project, run, call } = setup();
  const m = call("remember", {
    kind: "decision",
    content: "Migration preserves project identity and memory content",
  });
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(join(project, ".hippocampus/memory.sqlite"));
  db.exec("DROP TABLE proposals; PRAGMA user_version=2;");
  db.close();
  assert.equal(run("inspect", m.id).content, m.content);
  const p = call("propose", {
    memory: {
      kind: "constraint",
      content: "Review queue stays isolated by stable project ID",
    },
  });
  const other = mkdtempSync(join(tmpdir(), "hippo other project "));
  const invokeOther = (...args) =>
    spawnSync(process.execPath, [cli, ...args, "--project", other], {
      encoding: "utf8",
    });
  assert.equal(invokeOther("init").status, 0);
  const configPath = join(other, ".hippocampus/config.json");
  const config = JSON.parse(readFileSync(configPath));
  config.storage.sqlite.path = join(project, ".hippocampus/memory.sqlite");
  writeFileSync(configPath, JSON.stringify(config));
  assert.equal(JSON.parse(invokeOther("inbox").stdout).proposals.length, 0);
  assert.notEqual(invokeOther("review", "inspect", p.id).status, 0);
  assert.equal(run("inbox").proposals.length, 1);
});

test("concurrent proposal acceptance commits one mutation", async () => {
  const { project, call, run } = setup();
  const p = call("propose", {
    memory: {
      kind: "constraint",
      content: "Concurrent proposal approval must produce one canonical record",
    },
  });
  const { spawn } = await import("node:child_process");
  const accept = () =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [
        cli,
        "review",
        "accept",
        p.id,
        "--expected-revision",
        "1",
        "--project",
        project,
      ]);
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (data) => (stdout += data));
      child.stderr.on("data", (data) => (stderr += data));
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
  const results = await Promise.all([accept(), accept()]);
  assert.equal(results.filter((r) => r.code === 0).length, 1);
  assert.match(results.find((r) => r.code !== 0).stderr, /NOT_FOUND/);
  assert.equal(run("memories").length, 1);
  assert.equal(run("inbox").proposals.length, 0);
});

test("reviewed corrections preserve creation provenance and original capture identity", () => {
  const { call } = setup();
  const m = call("remember", {
    kind: "decision",
    content: "Refresh retries use an explicit bounded policy",
    createdBy: { client: "first-client" },
    idempotencyKey: "initial-decision",
  });
  const p = call("propose", {
    targetId: m.id,
    expectedRevision: 1,
    memory: {
      kind: "decision",
      content: "Refresh retries use a corrected bounded policy",
      createdBy: { client: "review-client" },
      idempotencyKey: "correction-event",
    },
  });
  const accepted = call("review", {
    id: p.id,
    action: "accept",
    expectedRevision: 1,
  }).memory;
  assert.equal(accepted.createdBy.client, "first-client");
  assert.equal(accepted.idempotencyKey, "initial-decision");
  assert.equal(accepted.revision, 2);
});
