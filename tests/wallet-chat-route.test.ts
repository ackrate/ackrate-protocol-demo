import assert from "node:assert/strict";
import * as nodeCrypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as ai from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import * as stellar from "@stellar/stellar-sdk";
import { loadAppConfig, type AppConfig } from "../lib/wallet/app-config";
import * as http from "../lib/wallet/http";
import * as agentTools from "../lib/wallet/agent402-tools";
import * as quotes from "../lib/wallet/marketplace-quote";
import * as chatRun from "../lib/wallet/chat-run";
import * as chatModel from "../lib/wallet/chat-model";

// Invoke the production POST with real AI SDK streaming, tool execution, input
// validation, HMAC quotes and session/origin guards. Only the external model,
// payment boundary, ready configuration and Next request context are fixtures.
// An explicit import allowlist prevents loading the live payment implementation.
function compile(relativePath: string) {
  return ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const routeSource = compile("../app/api/wallet/chat/route.ts");
const securitySource = compile("../lib/wallet/security.ts");
const ORIGIN = "https://example.test";
const SESSION_SECRET = "synthetic-chat-route-session-secret-".repeat(2);
const USER = stellar.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 21)).publicKey();
const OTHER_USER = stellar.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 22)).publicKey();
const SELLER = stellar.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 23)).publicKey();
const AGENT = stellar.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 24)).publicKey();
const REQUEST_ID = "7c5a2bf4-2714-4ed1-b792-1a3df0d311f0";
const MANDATE_ID = "a".repeat(64);
const PARAMETERS = { q: "What is Stellar?", count: 5 };
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const finish = (): LanguageModelV4StreamPart => ({ type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage });
const toolCall = (id: string, input = "{}"): LanguageModelV4StreamPart => ({ type: "tool-call", toolCallId: id, toolName: "purchase_source", input });
const stream = (chunks: LanguageModelV4StreamPart[]) => ({ stream: simulateReadableStream({ chunks, initialDelayInMs: null, chunkDelayInMs: null }) });
const normalModel = () => new MockLanguageModelV4({ doStream: stream([toolCall("selected-service"), finish()]) });
const apiError = (statusCode: number) => new ai.APICallError({ message: "synthetic provider private diagnostic", url: `${ORIGIN}/model`, requestBodyValues: {}, statusCode });
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
type PurchaseInput = {
  config: AppConfig; sessionAddress: string; sessionId: string; toolCallId: string;
  mandateId: string; sourceId: string; parameters: Record<string, unknown>; quoteToken: string;
};
type StreamEvent = { type: string; [key: string]: unknown };

function harness(options: {
  primary?: MockLanguageModelV4;
  backup?: MockLanguageModelV4;
  purchase?: (input: PurchaseInput) => Promise<unknown>;
} = {}) {
  // Do not inherit process.env or read deployment credentials. Readiness itself
  // is tested elsewhere; this fixture explicitly supplies the route's config.
  const config = loadAppConfig({
    NODE_ENV: "test", ACKRATE_WALLET_NETWORK: "mainnet",
    ACKRATE_CHAT_AGENT_PUBLIC_KEY: AGENT, ACKRATE_SESSION_SECRET: SESSION_SECRET,
    ACKRATE_APP_ORIGIN: ORIGIN, OPENAI_API_KEY: "synthetic-provider-key",
  });
  config.public = { ...config.public, ready: true, blockers: [] };
  if (options.backup) {
    config.llmProviders = ["openai", "anthropic"];
    config.anthropicKey = "synthetic-backup-provider-key";
  }
  const primary = options.primary ?? normalModel();
  const purchases: PurchaseInput[] = [];
  const providerCalls: string[] = [];
  const diagnostics: unknown[][] = [];
  let configReads = 0;
  let currentHeaders = new Headers();
  const securityModule = { exports: {} as typeof import("../lib/wallet/security") };
  vm.runInNewContext(securitySource, {
    module: securityModule, exports: securityModule.exports, Buffer, Error, Date,
    process: { env: { NODE_ENV: "production", ACKRATE_APP_ORIGIN: ORIGIN } },
    require(name: string) {
      if (name === "node:crypto") return nodeCrypto;
      if (name === "@stellar/stellar-sdk") return stellar;
      if (name === "next/headers") return {
        headers: async () => currentHeaders,
        cookies: async () => ({ get: (name: string) => {
          const value = currentHeaders.get("cookie")?.split("; ")
            .find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1);
          return value ? { name, value } : undefined;
        } }),
      };
      throw new Error(`Unexpected security import: ${name}`);
    },
  }, { filename: "lib/wallet/security.ts" });
  const security = securityModule.exports;
  const modules: Record<string, unknown> = {
    ai,
    "@ai-sdk/openai": { createOpenAI: () => (_modelId: string) => { providerCalls.push("openai"); return primary; } },
    "@ai-sdk/anthropic": { createAnthropic: () => (_modelId: string) => {
      providerCalls.push("backup"); assert.ok(options.backup, "unconfigured backup is forbidden"); return options.backup;
    } },
    "../../../../lib/wallet/app-config": { requireReadyConfig: () => { configReads += 1; return config; } },
    "../../../../lib/wallet/http": http,
    "../../../../lib/wallet/security": security,
    "../../../../lib/wallet/agent402-tools": agentTools,
    "../../../../lib/wallet/marketplace-quote": quotes,
    "../../../../lib/wallet/chat-run": chatRun,
    "../../../../lib/wallet/chat-model": chatModel,
    "../../../../lib/wallet/purchase": { purchaseCatalogItem: async (input: PurchaseInput) => {
      purchases.push(input);
      return options.purchase ? options.purchase(input) : { saved: true, report: "Synthetic saved service output." };
    } },
  };
  const routeModule = { exports: {} as { POST: (request: Request) => Promise<Response> } };
  vm.runInNewContext(routeSource, {
    module: routeModule, exports: routeModule.exports, Error,
    console: { error: (...args: unknown[]) => { diagnostics.push(args); } },
    require(name: string) {
      assert.ok(Object.hasOwn(modules, name), `Unexpected route import: ${name}`);
      return modules[name];
    },
  }, { filename: "app/api/wallet/chat/route.ts" });
  const token = (user = USER, network: "mainnet" | "testnet" = "mainnet", now?: number) =>
    security.createSessionToken(user, network, SESSION_SECRET, now).token;
  const quote = (overrides: Partial<Parameters<typeof quotes.issueMarketplaceQuote>[0]> = {}) =>
    quotes.issueMarketplaceQuote({ config, user: USER, sourceId: "agent402-research", parameters: PARAMETERS, payTo: SELLER, ...overrides }).token;
  const body = () => ({
    messages: [{ id: "user-run", role: "user", parts: [{ type: "text", text: PARAMETERS.q }] }],
    mandateId: MANDATE_ID, sourceId: "agent402-research", parameters: PARAMETERS,
    quoteToken: quote(), requestId: REQUEST_ID,
  });
  return {
    config, primary, purchases, providerCalls, diagnostics, security, token, quote, body,
    get configReads() { return configReads; },
    async post(value: unknown = body(), requestOptions: { origin?: string | null; token?: string | null; raw?: string } = {}) {
      currentHeaders = new Headers({ host: "example.test", "content-type": "application/json" });
      if (requestOptions.origin !== null) currentHeaders.set("origin", requestOptions.origin ?? ORIGIN);
      const sessionToken = requestOptions.token === undefined ? token() : requestOptions.token;
      if (sessionToken) currentHeaders.set("cookie", `${security.sessionCookieName()}=${sessionToken}`);
      return routeModule.exports.POST(new Request(`${ORIGIN}/api/wallet/chat`, {
        method: "POST", headers: currentHeaders, body: requestOptions.raw ?? JSON.stringify(value),
      }));
    },
  };
}

async function events(response: Response): Promise<StreamEvent[]> {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  return (await response.text()).split("\n").filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)) as StreamEvent);
}

async function rejected(h: ReturnType<typeof harness>, value: unknown, requestOptions: Parameters<ReturnType<typeof harness>["post"]>[1], status: number, message: RegExp) {
  const response = await h.post(value, requestOptions);
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.match((await response.json()).error, message);
  assert.equal(h.primary.doStreamCalls.length, 0);
  assert.equal(h.providerCalls.length, 0);
  assert.equal(h.purchases.length, 0);
}

test("production chat POST streams the configured saved result in exactly one model step", async () => {
  const h = harness();
  const body = { ...h.body(), parameters: { q: " What   is Stellar? ", count: "5" }, sessionAddress: OTHER_USER };
  const response = await h.post(body);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  const parts = await events(response);
  assert.equal(h.primary.doStreamCalls.length, 1, "the route must not request a second summary/model step");
  assert.deepEqual(plain(h.primary.doStreamCalls[0].toolChoice), { type: "tool", toolName: "purchase_source" });
  assert.deepEqual(plain(h.primary.doStreamCalls[0].providerOptions), { openai: { parallelToolCalls: false } });
  assert.equal(h.purchases.length, 1);
  const { config, ...purchase } = h.purchases[0];
  assert.equal(config, h.config);
  assert.deepEqual(plain(purchase), {
    sessionAddress: USER, sessionId: `${USER}:${MANDATE_ID}`, toolCallId: `configured:${REQUEST_ID}`,
    mandateId: MANDATE_ID, sourceId: body.sourceId, parameters: PARAMETERS, quoteToken: body.quoteToken,
  });
  assert.ok(parts.some((part) => part.type === "tool-output-available" && (part.output as { saved?: boolean })?.saved));
  assert.equal(parts.filter((part) => part.type === "start-step").length, 1);
  assert.ok(parts.some((part) => part.type === "finish"));
});

test("production chat admits at most one purchase even if the model emits parallel duplicate tools", async () => {
  const h = harness({ primary: new MockLanguageModelV4({ doStream: stream([toolCall("one"), toolCall("two"), toolCall("three"), finish()]) }) });
  const parts = await events(await h.post());
  assert.equal(h.purchases.length, 1);
  assert.equal(h.primary.doStreamCalls.length, 1);
  assert.equal(parts.filter((part) => part.type === "tool-output-available").length, 1);
  assert.equal(parts.filter((part) => part.type === "tool-output-error").length, 2);
});

test("model-supplied payment fields cannot change the configured purchase", async () => {
  const h = harness({ primary: new MockLanguageModelV4({ doStream: stream([
    toolCall("altered", JSON.stringify({ sourceId: "agent402-pdf", amount: "100", merchant: OTHER_USER })), finish(),
  ]) }) });
  const parts = await events(await h.post());
  assert.equal(h.purchases.length, 0);
  assert.equal(h.primary.doStreamCalls.length, 1);
  assert.ok(parts.some((part) => part.type === "tool-output-error"));
});

test("purchase failure retains the one-attempt guard without an automatic model or paid retry", async () => {
  const backup = normalModel();
  const h = harness({
    primary: new MockLanguageModelV4({ doStream: stream([toolCall("failed"), toolCall("retry"), finish()]) }), backup,
    purchase: async () => { throw new Error("Synthetic payment is pending; use receipt recovery."); },
  });
  const parts = await events(await h.post());
  assert.equal(h.purchases.length, 1);
  assert.equal(h.primary.doStreamCalls.length, 1);
  assert.equal(backup.doStreamCalls.length, 0);
  assert.equal(parts.filter((part) => part.type === "tool-output-error").length, 2);
  assert.equal(parts.some((part) => part.type === "tool-output-available"), false);
});

test("model startup failure is not retried and reveals no provider diagnostic", async () => {
  const h = harness({ primary: new MockLanguageModelV4({ doStream: async () => { throw apiError(429); } }) });
  const parts = await events(await h.post());
  assert.equal(h.primary.doStreamCalls.length, 1);
  assert.equal(h.purchases.length, 0);
  assert.ok(parts.some((part) => part.type === "error" && /check model access or credits/i.test(String(part.errorText))));
  assert.equal(JSON.stringify([parts, h.diagnostics]).includes("synthetic provider private diagnostic"), false);
});

test("configured pre-stream fallback may open once but cannot repeat a purchase", async () => {
  const backup = normalModel();
  const h = harness({ primary: new MockLanguageModelV4({ doStream: async () => { throw apiError(503); } }), backup });
  const parts = await events(await h.post());
  assert.equal(h.primary.doStreamCalls.length, 1);
  assert.equal(backup.doStreamCalls.length, 1);
  assert.equal(h.purchases.length, 1);
  assert.ok(parts.some((part) => part.type === "tool-output-available"));
});

test("an opened model stream cannot fall back or automatically repeat its attempted purchase", async () => {
  const backup = normalModel();
  const h = harness({ primary: new MockLanguageModelV4({ doStream: stream([
    toolCall("before-interruption"), { type: "error", error: apiError(503) }, finish(),
  ]) }), backup });
  const parts = await events(await h.post());
  assert.equal(h.primary.doStreamCalls.length, 1);
  assert.equal(backup.doStreamCalls.length, 0);
  assert.equal(h.purchases.length, 1);
  assert.ok(parts.some((part) => part.type === "error"));
});

test("actual session guard rejects absent, tampered, expired, challenge and wrong-network cookies", async () => {
  const h = harness();
  const valid = h.token();
  const now = Math.floor(Date.now() / 1000);
  const invalid = [
    null, `${valid.split(".")[0]}.${"A".repeat(43)}`,
    h.token(USER, "mainnet", now - 7200), h.token(USER, "testnet"),
    h.security.createChallengeToken(USER, "mainnet", "b".repeat(64), SESSION_SECRET).token,
  ];
  for (const token of invalid) await rejected(h, h.body(), { token }, 401, /wallet-authenticated session required/);
});

test("actual origin guard fails before configuration, model or purchase access", async () => {
  const h = harness();
  for (const origin of [null, "https://untrusted.example", `${ORIGIN}.untrusted.example`, "http://example.test"]) {
    await rejected(h, h.body(), { origin }, 400, /cross-origin request rejected/);
  }
  assert.equal(h.configReads, 0);
});

test("altered, stale, foreign-wallet and substituted-service quotes fail before model execution", async () => {
  const h = harness();
  const body = h.body();
  const now = Math.floor(Date.now() / 1000);
  const cases = [
    { ...body, quoteToken: `${body.quoteToken.split(".")[0]}.${"A".repeat(43)}` },
    { ...body, quoteToken: h.quote({ now: now - 3600 }) },
    { ...body, quoteToken: h.quote({ user: OTHER_USER }) },
    { ...body, parameters: { q: "An unapproved question", count: 5 } },
    { ...body, sourceId: "agent402-pdf", parameters: { url: "https://example.test/fixture.pdf" } },
    { ...body, sourceId: "unconfigured-service" },
  ];
  for (const value of cases) await rejected(h, value, {}, 400, /quote|not enabled/i);
  await rejected(h, body, { token: h.token(OTHER_USER) }, 400, /quote.*user/i);
});

test("incomplete Run, automatic continuation and invalid JSON fail without starting the model", async () => {
  const h = harness();
  const body = h.body();
  for (const value of [
    { ...body, sourceId: undefined }, { ...body, parameters: undefined },
    { ...body, requestId: "model-generated-retry" }, { ...body, quoteToken: "" },
    { ...body, messages: [{ id: "assistant", role: "assistant", parts: [{ type: "text", text: "Continue buying" }] }] },
  ]) await rejected(h, value, {}, 400, /complete Run request/);
  await rejected(h, body, { raw: "{" }, 400, /JSON/i);
});
