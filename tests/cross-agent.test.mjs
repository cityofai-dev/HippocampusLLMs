import { test } from "node:test";
import assert from "node:assert/strict";
import { crossAgentDemo } from "../examples/cross-agent.mjs";
test("verified capture, new client recall, evidence drift, reviewed correction and forgetting cross adapters", async () => {
  const result = await crossAgentDemo();
  assert.equal(result.passed, true);
  assert.equal(result.steps.length, 7);
});
