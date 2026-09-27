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
  assert.equal(ui.states.at(-1), "connect_incomplete"); assert.deepEqual(methods, ["GET"]);
  // WalletChatApp.authenticate catches cancellation and returns without a session.
  await ui.reconnect(async () => {});
  assert.equal(ui.states.at(-1), "connect_incomplete"); assert.deepEqual(methods, ["GET", "GET"]);
  await ui.reconnect(async () => { signedIn = true; });
  assert.equal(ui.states.at(-1), "eligible"); assert.deepEqual(methods, ["GET", "GET", "GET"]);
  ui.dispose();
});

test("tab-return checks during sign-in cannot race the authenticated final status read", async () => {
  let signedIn = false;
  let signIns = 0;
  let finishSignIn!: () => void;
  const waitingForWallet = new Promise<void>((resolve) => { finishSignIn = resolve; });
  const methods: string[] = [];
  const ui = client(async (_url, options) => {
    methods.push(options?.method ?? "GET");
    return signedIn ? response("eligible") : new Response(null, { status: 401 });
  });
  await ui.load(); assert.equal(ui.states.at(-1), "connect");
  const reconnect = ui.reconnect(async () => { signIns++; await waitingForWallet; signedIn = true; });
  // Visibility changes while the native wallet window is open must not start GETs.
  await ui.load(); await ui.load();
  assert.deepEqual(methods, ["GET"]);
  assert.equal(ui.states.at(-1), "checking");
  finishSignIn(); await reconnect;
  assert.equal(ui.states.at(-1), "eligible");
  assert.equal(ui.states.includes("connect_incomplete"), false);
  assert.deepEqual(methods, ["GET", "GET"]);
  assert.equal(signIns, 1);
  ui.dispose();
});

test("unmount suppresses late responses and malformed revision responses never claim success", async () => {
  let finish!: (response: Response) => void;
  const ui = client(async () => new Promise<Response>((resolve) => { finish = resolve; }));
  const pending = ui.load(); ui.dispose(); finish(response("succeeded", { brief })); await pending;
  assert.deepEqual(ui.states, ["checking"]); assert.deepEqual(ui.results, []);
  await ui.load(); await ui.retry();
  const invalid = client(async () => response("succeeded", { brief: { ...brief, summary: [] } }));
  await invalid.load(); assert.equal(invalid.states.at(-1), "unavailable"); assert.deepEqual(invalid.results, []);
  invalid.dispose();
});

test("status errors distinguish missing report, wrong wallet and service outage without implying an attempt", async () => {
  for (const [status, expected] of [[400, "unavailable"], [403, "unavailable"], [404, "wrong_wallet"], [503, "temporarily_unavailable"]] as const) {
    const methods: string[] = [];
    const ui = client(async (_url, options) => { methods.push(options?.method ?? "GET"); return Response.json({ error: "Untrusted server text" }, { status }); });
    await ui.load(); await ui.retry();
    assert.equal(ui.states.at(-1), expected);
    assert.deepEqual(methods, ["GET"]);
    assert.equal(ui.states.includes("uncertain"), false);
    ui.dispose();
  }
  const offline = client(async () => { throw new Error("Offline"); });
  await offline.load(); assert.equal(offline.states.at(-1), "temporarily_unavailable"); offline.dispose();
});

test("POST outage feedback survives eligible reconciliation and cannot resend automatically", async () => {
  const methods: string[] = [];
  const ui = client(async (_url, options) => {
    methods.push(options?.method ?? "GET");
    return options?.method === "POST" ? Response.json({ ok: false, error: "Unavailable" }, { status: 503 }) : response("eligible");
  });
  await ui.load(); await ui.retry(); await ui.retry();
  assert.deepEqual(methods, ["GET", "POST", "GET"]);
  assert.equal(ui.states.at(-1), "temporarily_unavailable");
  await ui.load(); assert.equal(ui.states.at(-1), "temporarily_unavailable");
  ui.dispose();
});

test("running and success status refreshes do not pass through checking or drop the running control", async () => {
  let status = "running";
  let finish: ((response: Response) => void) | undefined;
  const ui = client(async () => finish ? new Promise<Response>((resolve) => { finish = resolve; }) : response(status, { brief }));
  await ui.load(); assert.equal(ui.states.at(-1), "running");
  const previous = ui.states.length;
  finish = () => {};
  const poll = ui.load();
  assert.equal(ui.states.length, previous);
  finish(response("running")); await poll;
  assert.deepEqual(ui.states.slice(previous), ["running"]);
  finish = undefined; status = "succeeded"; await ui.load();
  const succeeded = ui.states.length;
  await ui.load();
  assert.deepEqual(ui.states.slice(succeeded), ["succeeded"]);
  assert.equal(ui.results.at(-1)?.focus, false);
  ui.dispose();
});

test("retry states keep one live status, described action and a focusable running button", () => {
  for (const state of ["checking", "eligible", "connect", "connect_incomplete", "running", "succeeded", "failed", "used", "uncertain", "unavailable", "wrong_wallet", "temporarily_unavailable"] as const) {
    const markup = renderToStaticMarkup(createElement(SummaryRetryView, { state, canReconnect: true, statusId: "status", helpId: "help" }));
    assert.equal((markup.match(/role="status"/g) ?? []).length, 1);
    if (["eligible", "connect", "connect_incomplete", "running"].includes(state)) {
      assert.match(markup, /aria-describedby="help"/);
      assert.match(markup, /No new search or wallet payment/);
    } else assert.doesNotMatch(markup, /<button/);
    if (state === "running") { assert.match(markup, /aria-disabled="true"/); assert.doesNotMatch(markup, / disabled=/); }
    if (state === "uncertain") { assert.doesNotMatch(markup, /Reload to check/); assert.match(markup, /No further retry/); }
  }
  const markup = renderToStaticMarkup(createElement(ReportEditorial, { brief, titleId: "report", summaryHeadingId: "summary",
    summarySlot: createElement(SummaryRetryView, { state: "succeeded", statusId: "status", helpId: "help" }) }));
  assert.match(markup, /Written summary added/);
  assert.match(markup, /id="summary" tabindex="-1"/);
});

test("retry availability copy preserves the visible report and does not promise absent sign-in controls", () => {
  const render = (state: SummaryRetryState, canReconnect = false) => renderToStaticMarkup(createElement(SummaryRetryView, { state, canReconnect, statusId: "status", helpId: "help" }));
  assert.match(render("wrong_wallet"), /Summary retry is unavailable for this report with the signed-in wallet/);
  assert.doesNotMatch(render("wrong_wallet"), /This report is not available|Use the wallet that paid/);
  assert.match(render("unavailable"), /Summary retry is unavailable/);
  assert.match(render("unavailable"), /Read Sources or use Download report and Receipt JSON/);
  assert.doesNotMatch(render("unavailable"), /saved summary could not be opened/);
  assert.match(render("temporarily_unavailable"), /Reload the page later to try again/);
  for (const state of ["connect", "connect_incomplete"] as const) {
    assert.match(render(state), /wallet sign-in, which this view cannot start/);
    assert.doesNotMatch(render(state), /<button|Reconnect to retry/);
    assert.match(render(state, true), /<button/);
  }
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
