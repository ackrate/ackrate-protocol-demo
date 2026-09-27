import assert from "node:assert/strict";
import test from "node:test";
import { createConfiguredOpenAIChat } from "../lib/wallet/chat-model";

test("custom model endpoint receives streaming tool requests via chat completions", async (t) => {
  let observedUrl = "";
  let payload: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    observedUrl = String(input);
    payload = JSON.parse(String(init?.body));
    return new Response('data: {"id":"test","object":"chat.completion.chunk","created":1,"model":"gemini-3.8-flash","choices":[{"index":0,"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', {
      headers: { "content-type": "text/event-stream" },
    });
  });
  const model = createConfiguredOpenAIChat("fixture-key", "gemini-3.8-flash", "https://generativelanguage.googleapis.com/v1beta/openai/");
  const result = await model.doStream({ prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    tools: [{ type: "function", name: "purchase_source", inputSchema: { type: "object", properties: {} } }],
    toolChoice: { type: "tool", toolName: "purchase_source" },
  });
  const reader = result.stream.getReader();
  while (true) { const { value, done } = await reader.read(); if (done) break; assert.notEqual(value.type, "error"); }
  assert.equal(observedUrl, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  assert.equal(payload.model, "gemini-3.8-flash");
  assert.deepEqual(payload.tool_choice, { type: "function", function: { name: "purchase_source" } });
  assert.equal(payload.stream, true);
});

test("default OpenAI configuration retains the Responses provider", () => {
  assert.equal(createConfiguredOpenAIChat("fixture-key", "gpt-5-mini", "").provider, "openai.responses");
});
