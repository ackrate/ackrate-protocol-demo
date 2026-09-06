import assert from "node:assert/strict";
import test from "node:test";
import { APICallError, convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { ConfiguredChatBody, configuredPurchaseTool } from "../lib/wallet/chat-run";
import { withPreStreamFallback } from "../lib/wallet/chat-model";

const messages: UIMessage[] = [{ id: "user-run-1", role: "user", parts: [{ type: "text", text: "What is Stellar?" }] }];
const body = { mandateId: "a".repeat(64), sourceId: "agent402-research", parameters: { q: "What is Stellar?" }, quoteToken: "fixture-quote-not-valid-for-payment", requestId: crypto.randomUUID() };
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const finish = (toolCalls = false): LanguageModelV4StreamPart => ({ type: "finish", finishReason: { unified: toolCalls ? "tool-calls" : "stop", raw: undefined }, usage });
const toolCall = (id: string, input = "{}"): LanguageModelV4StreamPart => ({ type: "tool-call", toolCallId: id, toolName: "purchase_source", input });
const response = (chunks: LanguageModelV4StreamPart[]) => ({ stream: simulateReadableStream({ chunks, initialDelayInMs: null, chunkDelayInMs: null }) });
const textResponse = () => response([{ type: "text-start", id: "summary" }, { type: "text-delta", id: "summary", delta: "Saved result." }, { type: "text-end", id: "summary" }, finish()]);
const apiError = (statusCode: number) => new APICallError({ message: "fixture provider error", url: "https://example.test/model", requestBodyValues: {}, statusCode });

test("actual assistant-ui transport sends a complete configured Run accepted by the server schema", async () => {
  let sent: unknown;
  const transport = new AssistantChatTransport({
    api: "/api/wallet/chat", body: () => body,
    fetch: async (_input, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response(new ReadableStream({ start(controller) { controller.close(); } }), { headers: { "content-type": "text/event-stream" } });
    },
  });
  await transport.sendMessages({ trigger: "submit-message", chatId: "wallet-thread", messageId: undefined, messages, abortSignal: undefined });
  assert.deepEqual(ConfiguredChatBody.parse(sent), { ...body, messages });
  assert.equal((await convertToModelMessages(ConfiguredChatBody.parse(sent).messages))[0].role, "user");
});

test("chat rejects legacy, malformed and automatic continuation requests before model execution", () => {
  const complete = { ...body, messages };
  for (const name of ["sourceId", "parameters", "quoteToken", "requestId"] as const) {
    assert.equal(ConfiguredChatBody.safeParse({ ...complete, [name]: undefined }).success, false, name);
  }
  for (const invalid of [
    { ...complete, requestId: "model-generated-call-id" },
    { ...complete, quoteToken: "" },
    { ...complete, messages: [{}] },
    { ...complete, messages: [{ id: "x", role: "assistant", parts: [{ type: "text", text: "Continue" }] }] },
  ]) assert.equal(ConfiguredChatBody.safeParse(invalid).success, false);
});

async function runFixture(model: MockLanguageModelV4 | ReturnType<typeof withPreStreamFallback>, purchase: () => Promise<unknown>) {
  const result = streamText({
    model, maxRetries: 0, messages: await convertToModelMessages(messages), stopWhen: stepCountIs(2),
    onError: () => { /* Expected fixture failures are asserted in fullStream below. */ },
    prepareStep: ({ stepNumber }) => ({ toolChoice: stepNumber > 0 ? "none" : { type: "tool", toolName: "purchase_source" } }),
    tools: { purchase_source: configuredPurchaseTool(purchase) },
  });
  const parts = [];
  for await (const part of result.fullStream) parts.push(part);
  return parts;
}

test("installed AI SDK accepts zero-argument purchase tool then disables tools for the response", async () => {
  let purchases = 0;
  const model = new MockLanguageModelV4({ doStream: [response([toolCall("one"), finish(true)]), textResponse()] });
  const parts = await runFixture(model, async () => { purchases += 1; return { saved: true }; });
  assert.equal(purchases, 1);
  assert.ok(parts.some((part) => part.type === "tool-result"));
  assert.deepEqual(model.doStreamCalls[0].toolChoice, { type: "tool", toolName: "purchase_source" });
  assert.deepEqual(model.doStreamCalls[1].toolChoice, { type: "none" });
});

test("duplicate model calls, unknown payment fields and failed purchases cannot run twice", async () => {
  let purchases = 0;
  const duplicate = new MockLanguageModelV4({ doStream: [response([toolCall("one"), toolCall("two"), finish(true)]), textResponse()] });
  const parts = await runFixture(duplicate, async () => { purchases += 1; return { saved: true }; });
  assert.equal(purchases, 1);
  assert.ok(parts.some((part) => part.type === "tool-error"));
  const changed = new MockLanguageModelV4({ doStream: [response([toolCall("injected", '{"sourceId":"different-service"}'), finish(true)]), textResponse()] });
  await runFixture(changed, async () => { purchases += 1; return {}; });
  assert.equal(purchases, 1);
  const failed = new MockLanguageModelV4({ doStream: [response([toolCall("failed"), toolCall("retry"), finish(true)]), textResponse()] });
  await runFixture(failed, async () => { purchases += 1; throw new Error("Receipt requires recovery"); });
  assert.equal(purchases, 2);
});

test("pre-stream provider failure uses one backup and remains on it after the purchase", async () => {
  for (const status of [401, 403, 429, 500, 503]) {
    let purchases = 0;
    const primary = new MockLanguageModelV4({ doStream: async () => { throw apiError(status); } });
    const backup = new MockLanguageModelV4({ doStream: [response([toolCall("one"), finish(true)]), textResponse()] });
    const parts = await runFixture(withPreStreamFallback(primary, backup), async () => { purchases += 1; return { saved: true }; });
    assert.equal(purchases, 1);
    assert.equal(primary.doStreamCalls.length, 1);
    assert.equal(backup.doStreamCalls.length, 2);
    assert.ok(parts.some((part) => part.type === "text-delta"));
    assert.deepEqual(backup.doStreamCalls[1].toolChoice, { type: "none" });
  }
});

test("bad requests, opened streams and post-purchase model errors never trigger fallback", async () => {
  const backup = new MockLanguageModelV4({ doStream: async () => { throw new Error("Backup must not be called"); } });
  const badRequest = new MockLanguageModelV4({ doStream: async () => { throw apiError(400); } });
  await runFixture(withPreStreamFallback(badRequest, backup), async () => { throw new Error("No purchase expected"); });
  assert.equal(backup.doStreamCalls.length, 0);
  const partial = new MockLanguageModelV4({ doStream: response([{ type: "text-start", id: "partial" }, { type: "text-delta", id: "partial", delta: "Started" }, { type: "error", error: apiError(503) }]) });
  await runFixture(withPreStreamFallback(partial, backup), async () => { throw new Error("No purchase expected"); });
  assert.equal(backup.doStreamCalls.length, 0);
  let purchases = 0;
  let calls = 0;
  const paid = new MockLanguageModelV4({ doStream: async () => {
    if (calls++ === 0) return response([toolCall("paid"), finish(true)]);
    throw apiError(503);
  } });
  const parts = await runFixture(withPreStreamFallback(paid, backup), async () => { purchases += 1; return { saved: true }; });
  assert.equal(purchases, 1);
  assert.equal(backup.doStreamCalls.length, 0);
  assert.ok(parts.some((part) => part.type === "tool-result"));
  assert.ok(parts.some((part) => part.type === "error"));
});

test("aborted startup and a failed backup are not retried", async () => {
  const controller = new AbortController();
  const primary = new MockLanguageModelV4({ doStream: async () => { controller.abort(); throw apiError(429); } });
  const backup = new MockLanguageModelV4({ doStream: async () => { throw apiError(503); } });
  const model = withPreStreamFallback(primary, backup);
  await assert.rejects(async () => model.doStream({ prompt: [], abortSignal: controller.signal }), /fixture provider error/);
  assert.equal(backup.doStreamCalls.length, 0);
  const failedPrimary = new MockLanguageModelV4({ doStream: async () => { throw apiError(429); } });
  await runFixture(withPreStreamFallback(failedPrimary, backup), async () => { throw new Error("No purchase expected"); });
  assert.equal(failedPrimary.doStreamCalls.length, 1);
  assert.equal(backup.doStreamCalls.length, 1);
});

test("concurrent startup on one Run is rejected without sharing state with another Run", async () => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const primary = new MockLanguageModelV4({ doStream: async () => { await waiting; return textResponse(); } });
  const backup = new MockLanguageModelV4({ doStream: async () => { throw new Error("No backup expected"); } });
  const model = withPreStreamFallback(primary, backup);
  const first = model.doStream({ prompt: [] });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await assert.rejects(async () => model.doStream({ prompt: [] }), /already opening/);
  release();
  await first;
  assert.equal(primary.doStreamCalls.length, 1);
  assert.equal(backup.doStreamCalls.length, 0);
  const independent = withPreStreamFallback(new MockLanguageModelV4({ doStream: textResponse() }));
  const stream = await independent.doStream({ prompt: [] });
  assert.ok(stream.stream instanceof ReadableStream);
});
