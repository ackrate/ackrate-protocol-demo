import assert from "node:assert/strict";
import test from "node:test";
import { configuredLlmProviders } from "../lib/llm-policy";

const keys: NodeJS.ProcessEnv = { NODE_ENV: "test", OPENAI_API_KEY: "test-primary", ANTHROPIC_API_KEY: "test-disabled" };
test("default and explicit OpenAI-only skip alternate even with both keys and alternate primary", () => {
  for (const LLM_PROVIDER_MODE of [undefined, "", "openai-only"]) {
    assert.deepEqual(configuredLlmProviders({ ...keys, LLM_PROVIDER_MODE, LLM_PRIMARY: "anthropic" }), ["openai"]);
    assert.deepEqual(configuredLlmProviders({ ...keys, OPENAI_API_KEY: "", LLM_PROVIDER_MODE }), []);
  }
});
test("failover must be explicitly enabled and respects enabled key ordering", () => {
  assert.deepEqual(configuredLlmProviders({ ...keys, LLM_PROVIDER_MODE: "failover" }), ["openai", "anthropic"]);
  assert.deepEqual(configuredLlmProviders({ ...keys, LLM_PROVIDER_MODE: "failover", LLM_PRIMARY: "anthropic" }), ["anthropic", "openai"]);
  assert.deepEqual(configuredLlmProviders({ NODE_ENV: "test", ANTHROPIC_API_KEY: "backup", LLM_PROVIDER_MODE: "failover" }), ["anthropic"]);
  assert.throws(() => configuredLlmProviders({ ...keys, LLM_PROVIDER_MODE: "typo" }), /LLM_PROVIDER_MODE/);
});
