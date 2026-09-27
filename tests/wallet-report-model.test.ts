import assert from "node:assert/strict";
import test from "node:test";
import type OpenAI from "openai";
import { buildReportLlm, GeminiProvider, OpenAIProvider } from "../lib/llm";
import { REPORT_RESPONSE_FORMAT } from "../lib/wallet/marketplace-report";

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

test("structured format is report-only and preserves completion outcome metadata", async () => {
  const bodies: Record<string, unknown>[] = [];
  const client = { chat: { completions: { create: async (body: Record<string, unknown>) => {
    bodies.push(body);
    return { _request_id: "req_fixture", choices: [{ finish_reason: "length", message: { content: "partial", refusal: null } }] };
  } } } } as unknown as OpenAI;
  const provider = new OpenAIProvider("report", client);
  const request = { system: "Public fixture", messages: [], maxTokens: 6000 };
  const structured = await provider.complete({ ...request, responseFormat: REPORT_RESPONSE_FORMAT }, "main");
  assert.deepEqual(bodies[0].response_format, { type: "json_schema", json_schema: { ...REPORT_RESPONSE_FORMAT, strict: true } });
  assert.deepEqual(structured.metadata, { finishReason: "length", refused: false, requestId: "req_fixture" });
  await provider.complete(request, "main");
  assert.equal(bodies[1].response_format, undefined);
  assert.equal(REPORT_RESPONSE_FORMAT.schema.additionalProperties, false);
  assert.deepEqual(REPORT_RESPONSE_FORMAT.schema.required, ["title", "subtitle", "opening", "findings", "takeaway", "summary"]);
  const schema = JSON.stringify(REPORT_RESPONSE_FORMAT.schema);
  assert.doesNotMatch(schema, /"(?:\$schema|minLength|maxLength)":/);
  const properties = REPORT_RESPONSE_FORMAT.schema.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual(properties.title, { type: "string", description: "Use 8 to 120 characters." });
  assert.deepEqual(properties.summary, { type: "array", items: { type: "string", description: "Use 80 to 1200 characters." }, minItems: 3, maxItems: 4 });
  assert.deepEqual(properties.findings.items, { type: "object", properties: { title: { type: "string", description: "Use 4 to 120 characters." }, body: { type: "string", description: "Use 30 to 1000 characters." } }, required: ["title", "body"], additionalProperties: false });
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

test("report composition falls back from unavailable Luna to Gemini without another purchase", async (t) => {
  const updates = { OPENAI_API_KEY: "fixture-gateway", GEMINI_API_KEY: "fixture-google", LLM_PROVIDER_MODE: "openai-gemini-failover", OPENAI_REPORT_MODEL: "openai/gpt-6-luna", GEMINI_MODEL: "gemini-3.8-flash" };
  const saved = Object.fromEntries(Object.keys(updates).map((k) => [k, process.env[k]]));
  Object.assign(process.env, updates);
  t.after(() => { for (const [k,v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  const calls: string[] = [];
  t.mock.method(OpenAIProvider.prototype, "complete", async function (this: OpenAIProvider) {
    calls.push(this.id);
    if (this.id === "openai") throw Object.assign(new Error("synthetic unavailable"), { status: 403 });
    return { text: "fixture report", toolCalls: [], stopReason: "end" as const };
  });
  const result = await buildReportLlm().complete({ system: "fixture", messages: [], maxTokens: 10 }, "main");
  assert.deepEqual(calls, ["openai", "gemini"]);
  assert.equal(result.providerId, "gemini");
});

test("Gemini refuses a missing key instead of inheriting a Gateway credential", (t) => {
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  t.after(() => { if (saved !== undefined) process.env.GEMINI_API_KEY = saved; });
  assert.throws(() => new GeminiProvider("fixture"), /Gemini API key is required/);
});

test("Google tool metadata is preserved for Gemini and excluded from Gateway requests", async () => {
  const bodies: Record<string, unknown>[] = [];
  const extraContent = { google: { thought_signature: "synthetic-signature" } };
  const client = { chat: { completions: { create: async (body: Record<string, unknown>) => {
    bodies.push(body);
    return { choices: [{ finish_reason: "tool_calls", message: { content: "", tool_calls: [{ id: "tool1", type: "function", function: { name: "lookup", arguments: "{}" }, extra_content: extraContent }] } }] };
  } } } } as unknown as OpenAI;
  class GoogleFixture extends OpenAIProvider { override readonly id = "gemini"; }
  const google = new GoogleFixture("fixture", client);
  const request = { system: "fixture", messages: [], maxTokens: 20 };
  const response = await google.complete(request, "main");
  assert.deepEqual(response.toolCalls[0].extraContent, extraContent);
  const replay = { ...request, messages: [{ role: "assistant" as const, text: "", toolCalls: response.toolCalls }] };
  await google.complete(replay, "main");
  await new OpenAIProvider("fixture", client).complete(replay, "main");
  const signature = (body: Record<string, unknown>) => JSON.stringify(body.messages).includes("synthetic-signature");
  assert.equal(signature(bodies[1]), true);
  assert.equal(signature(bodies[2]), false);
});
