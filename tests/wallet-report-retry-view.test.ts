import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createSummaryRetryClient, SummaryRetryView, type SummaryRetryState } from "../components/wallet/SummaryRetry";
import { ReportEditorial } from "../components/wallet/ReportEditorial";
import { purchaseResultDownload, type PurchaseResult } from "../components/wallet/AssistantThread";
import type { MarketBrief } from "../lib/wallet/market-brief";

const input = { mandateId: "a".repeat(64), txHash: "b".repeat(64) };
const brief: MarketBrief = {
  title: "Library lending explained", kicker: "Saved sources", subtitle: "A synthetic report for testing.",
  opening: "The guide describes borrowing books from a library. [1]", findings: [],
  takeaway: "Read the original guide for the lending rules. [1]",
  sources: [{ publisher: "example.org", title: "Library guide", url: "https://example.org/library" }],
  summary: ["A library lends books for a set period. [1]", "Borrowers return books by the due date. [1]", "Read the local lending rules before borrowing. [1]"],
  editorialPasses: 1,
};
const response = (status: string, extra = {}) => Response.json({ ok: true, status, retryAllowed: status === "eligible", ...extra });
function client(fetcher: typeof fetch) {
  const states: SummaryRetryState[] = [];
  const results: { brief: MarketBrief; focus: boolean }[] = [];
  const controller = createSummaryRetryClient(input, { fetcher, onState: (state) => states.push(state), onResult: (brief, focus) => results.push({ brief, focus }) });
  return { ...controller, states, results };
}

test("status must load before retry; double click produces one POST and success requests summary focus", async () => {
  const methods: string[] = [];
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => { finish = resolve; });
  const ui = client(async (_url, options) => { methods.push(options?.method ?? "GET"); return options?.method === "POST" ? pending : methods.length === 1 ? response("eligible") : response("succeeded", { brief }); });
  await ui.retry(); assert.deepEqual(methods, []);
  await ui.load(); assert.deepEqual(methods, ["GET"]);
  const first = ui.retry(); await ui.retry();
  assert.deepEqual(methods, ["GET", "POST"]);
  finish(response("succeeded", { brief })); await first;
  assert.equal(ui.states.at(-1), "succeeded");
  assert.deepEqual(ui.results, [{ brief, focus: true }]);
  await ui.retry(); assert.equal(methods.length, 2);
  await ui.load(); assert.equal(ui.results.at(-1)?.focus, false);
  ui.dispose();
});

test("a lost POST response only reconciles with GET; running, uncertain and used attempts cannot POST", async () => {
  for (const terminal of ["running", "uncertain", "failed"]) {
    const methods: string[] = [];
    const ui = client(async (_url, options) => {
      methods.push(options?.method ?? "GET");
      if (options?.method === "POST") throw new Error("Connection interrupted");
      return response(methods.length === 1 ? "eligible" : terminal);
    });
    await ui.load(); await ui.retry(); await ui.retry();
    assert.deepEqual(methods, ["GET", "POST", "GET"]);
    assert.equal(ui.states.at(-1), terminal === "failed" ? "used" : terminal);
    ui.dispose();
  }
});

test("read-only reload restores a summary without shifting focus or posting", async () => {
  const methods: string[] = [];
  const ui = client(async (_url, options) => { methods.push(options?.method ?? "GET"); return response("succeeded", { brief }); });
  await ui.load(); await ui.retry();
  assert.deepEqual(methods, ["GET"]);
  assert.deepEqual(ui.results, [{ brief, focus: false }]);
  ui.dispose();
});

test("reconnect cancellation is recoverable; a successful sign-in checks status without retrying", async () => {
  let signedIn = false;
  const methods: string[] = [];
  const ui = client(async (_url, options) => {
    methods.push(options?.method ?? "GET");
    return signedIn ? response("eligible") : new Response(null, { status: 401 });
  });
  await ui.load(); assert.equal(ui.states.at(-1), "connect");
  await ui.reconnect(async () => { throw new Error("User cancelled"); });
  assert.equal(ui.states.at(-1), "connect"); assert.deepEqual(methods, ["GET"]);
  await ui.reconnect(async () => { signedIn = true; });
  assert.equal(ui.states.at(-1), "eligible"); assert.deepEqual(methods, ["GET", "GET"]);
  ui.dispose();
});

test("unmount suppresses late responses and malformed revision responses never claim success", async () => {
  let finish!: (response: Response) => void;
  const ui = client(async () => new Promise<Response>((resolve) => { finish = resolve; }));
  const pending = ui.load(); ui.dispose(); finish(response("succeeded", { brief })); await pending;
  assert.deepEqual(ui.states, ["checking"]); assert.deepEqual(ui.results, []);
  await ui.load(); await ui.retry();
  const invalid = client(async () => response("succeeded", { brief: { ...brief, summary: [] } }));
  await invalid.load(); assert.equal(invalid.states.at(-1), "uncertain"); assert.deepEqual(invalid.results, []);
  invalid.dispose();
});

test("retry states keep one live status, described action and a focusable running button", () => {
  for (const state of ["checking", "eligible", "connect", "running", "succeeded", "failed", "used", "uncertain"] as const) {
    const markup = renderToStaticMarkup(createElement(SummaryRetryView, { state, canReconnect: true, statusId: "status", helpId: "help" }));
    assert.equal((markup.match(/role="status"/g) ?? []).length, 1);
    if (["eligible", "connect", "running"].includes(state)) {
      assert.match(markup, /aria-describedby="help"/);
      assert.match(markup, /No new search or wallet payment/);
    } else assert.doesNotMatch(markup, /<button/);
    if (state === "running") { assert.match(markup, /aria-disabled="true"/); assert.doesNotMatch(markup, / disabled=/); }
  }
  const markup = renderToStaticMarkup(createElement(ReportEditorial, { brief, titleId: "report", summaryHeadingId: "summary",
    summarySlot: createElement(SummaryRetryView, { state: "succeeded", statusId: "status", helpId: "help" }) }));
  assert.match(markup, /Written summary added/);
  assert.match(markup, /id="summary" tabindex="-1"/);
});

test("derived report download preserves byte-identical original receipt and purchase data", () => {
  const result: PurchaseResult = {
    source: { id: "agent402-research", title: "Web search" },
    payment: { status: "settled", amount: "0.01", asset: "USDC", ...input },
    delivered: { brief: { ...brief, editorialPasses: 0, summary: undefined } },
  };
  const original = JSON.stringify(result, null, 2);
  const report = purchaseResultDownload(result, "report", brief);
  assert.ok(report.content.includes(`## Summary\n\n${brief.summary!.join("\n\n")}`));
  assert.equal(purchaseResultDownload(result, "receipt", brief).content, original);
  assert.equal(JSON.stringify(result, null, 2), original);
});
