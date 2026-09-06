import assert from "node:assert/strict";
import test from "node:test";
import type OpenAI from "openai";
import { buildReportLlm, OpenAIProvider } from "../lib/llm";

test("report model is scoped separately from the chat model and defaults to the requested model", async (t) => {
  const saved = { key: process.env.OPENAI_API_KEY, chat: process.env.OPENAI_MODEL, report: process.env.OPENAI_REPORT_MODEL };
  t.after(() => {
    for (const [name, value] of Object.entries({ OPENAI_API_KEY: saved.key, OPENAI_MODEL: saved.chat, OPENAI_REPORT_MODEL: saved.report })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  process.env.OPENAI_API_KEY = "local-fixture-never-sent";
  process.env.OPENAI_MODEL = "existing-chat-model";
  delete process.env.OPENAI_REPORT_MODEL;
  t.mock.method(OpenAIProvider.prototype, "complete", async () => ({ text: "fixture", toolCalls: [], stopReason: "end" as const }));
  const result = await buildReportLlm().complete({ system: "fixture", messages: [], maxTokens: 10 }, "main");
  assert.equal(result.providerId, "openai");
  assert.match(result.engine, /GPT-6-astra/);
  assert.equal(process.env.OPENAI_MODEL, "existing-chat-model");
});

test("text-only report uses supported reasoning and completion bounds without changing tool requests", async () => {
  let submitted: Record<string, unknown> | undefined;
  const client = { chat: { completions: { create: async (body: Record<string, unknown>) => {
    submitted = body;
    return { choices: [{ finish_reason: "stop", message: { content: "report", tool_calls: [] } }] };
  } } } } as unknown as OpenAI;
  const provider = new OpenAIProvider("report editor", client, { main: "gpt-6-astra" });
  const result = await provider.complete({ system: "Write clearly.", messages: [{ role: "user", text: "Public source packet." }], maxTokens: 6_000, reasoningEffort: "low" }, "main");
  assert.equal(result.text, "report");
  assert.equal(submitted?.model, "gpt-6-astra");
  assert.equal(submitted?.reasoning_effort, "low");
  assert.equal(submitted?.max_completion_tokens, 6_000);
  for (const key of ["temperature", "top_p", "logprobs", "tools"]) assert.equal(submitted?.[key], undefined);
});
