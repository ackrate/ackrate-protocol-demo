import assert from "node:assert/strict";
import test from "node:test";
import { FailoverLlm, type LlmProvider, type LlmRequest, type Tier } from "../lib/llm";

const request: LlmRequest = {
  system: "test",
  messages: [{ role: "user", text: "test" }],
  maxTokens: 100,
};

function provider(id: string, calls: string[]): LlmProvider {
  return {
    id,
    label: id,
    brand: id,
    engineName: (_tier: Tier) => id,
    complete: async () => {
      calls.push(id);
      return { text: `{\"provider\":\"${id}\"}`, toolCalls: [], stopReason: "end" };
    },
  };
}

test("an editorial review can require a provider distinct from the first pass", async () => {
  const calls: string[] = [];
  const llm = new FailoverLlm([provider("primary", calls), provider("reviewer", calls)]);

  const first = await llm.complete(request, "main");
  const second = await llm.complete(request, "main", { excludeProviderId: first.providerId });

  assert.equal(first.providerId, "primary");
  assert.equal(second.providerId, "reviewer");
  assert.deepEqual(calls, ["primary", "reviewer"]);
});
