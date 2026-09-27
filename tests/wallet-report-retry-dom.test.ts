import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { PurchaseReport, purchaseResultDownload, type PurchaseResult } from "../components/wallet/AssistantThread";
import type { MarketBrief } from "../lib/wallet/market-brief";

const originalBrief: MarketBrief = {
  title: "Library source overview", kicker: "Saved sources", subtitle: "Synthetic report fixture.",
  opening: "The guide describes borrowing books. [1]",
  findings: [{ number: "01", title: "Lending rules", body: "The library publishes lending rules. [1]" }],
  takeaway: "Read the guide for details. [1]", editorialPasses: 0,
  sources: [{ publisher: "example.org", title: "Library guide", url: "https://example.org/library" }],
};
const revisedBrief: MarketBrief = {
  ...originalBrief, title: "Library lending explained", editorialPasses: 1,
  summary: ["A library lends books. [1]", "Books have a return date. [1]", "Check the guide before borrowing. [1]"],
};
const result: PurchaseResult = {
  source: { id: "agent402-research", title: "Web search" },
  payment: { status: "settled", amount: "0.01", asset: "USDC", txHash: "a".repeat(64), mandateId: "b".repeat(64) },
  delivered: {
    brief: originalBrief,
    marketplace: {
      query: "Library lending", count: 1, untrustedContent: true,
      results: [{ title: "Library guide", url: "https://example.org/library", description: "Lending rules.", age: null }],
      discovery: { marketplace: "Agent402", marketplaceUrl: "https://agent402.tools/stellar", seller: "fixture-seller", sellerName: "Fixture seller", route: "/api/search", serviceUrl: "https://example.org/search", health: 1 },
      settlement: { transaction: "c".repeat(64), network: "stellar:pubnet", amountAtomic: "100000", amount: "0.01", asset: "USDC", payTo: "fixture-recipient", payer: null, idempotencyKey: "fixture-only" },
      trustlineTransaction: null,
    },
  },
};

for (const scenario of ["manual retry", "saved-summary reload"] as const) {
  test(`${scenario} replaces one status region without remounting the retry or changing the receipt`, async (t) => {
    const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "https://example.org/wallet", pretendToBeVisual: true });
    const globals = {
      window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
      localStorage: dom.window.localStorage, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true,
    };
    const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const requests: { method: string; finish: (response: Response) => void }[] = [];
    t.mock.method(globalThis, "fetch", async (url: string, options?: RequestInit) => {
      assert.ok(url.startsWith("/api/wallet/reports/retry"), "only the summary status API may be called");
      return new Promise<Response>((finish) => requests.push({ method: options?.method ?? "GET", finish }));
    });
    const errors: unknown[][] = [];
    t.mock.method(console, "error", (...args: unknown[]) => { errors.push(args); });
    const container = dom.window.document.getElementById("root")!;
    const root = createRoot(container);
    const render = () => root.render(createElement(PurchaseReport, { result, explorerNetwork: "public", registryId: "fixture-registry", autoScroll: false }));
    const statuses = () => container.querySelectorAll(".report-summary-retry [role='status']");
    const respond = async (index: number, status: "eligible" | "succeeded") => {
      await act(async () => requests[index].finish(Response.json({ ok: true, status, retryAllowed: status === "eligible", ...(status === "succeeded" ? { brief: revisedBrief } : {}) })));
    };
    const receipt = JSON.stringify(result, null, 2);
    try {
      await act(async () => render());
      assert.deepEqual(requests.map(({ method }) => method), ["GET"]);
      assert.equal(statuses().length, 1);
      assert.equal(statuses()[0].textContent, "Checking summary status…");
      const shareButton = container.querySelector<HTMLButtonElement>(".report-share button")!;
      if (scenario === "manual retry") {
        await respond(0, "eligible");
        await act(async () => container.querySelector<HTMLButtonElement>(".report-summary-retry button")!.click());
        assert.deepEqual(requests.map(({ method }) => method), ["GET", "POST"]);
        assert.match(statuses()[0].textContent!, /Retrying written summary/);
        await respond(1, "succeeded");
      } else {
        shareButton.focus();
        await respond(0, "succeeded");
      }
      const completedRequests = scenario === "manual retry" ? ["GET", "POST"] : ["GET"];
      assert.deepEqual(requests.map(({ method }) => method), completedRequests, "success must not remount the retry and start another GET");
      assert.equal(statuses().length, 1, "completion must replace the existing status, not leave orphaned rows");
      assert.match(statuses()[0].textContent!, /^Written summary added\./);
      assert.doesNotMatch(container.textContent!, /Checking summary status|Retrying written summary/);
      assert.equal(container.querySelectorAll(".brief-takeaway").length, 0);
      assert.equal(container.querySelectorAll(".brief-plain-english").length, 1);
      assert.equal(container.querySelector(".report-share button"), shareButton, "the sharing control stays mounted");
      assert.equal(dom.window.document.activeElement, scenario === "manual retry" ? container.querySelector(".brief-plain-english h3") : shareButton);

      // Re-rendering the parent and returning to the tab must not append status rows.
      for (let i = 0; i < 3; i += 1) {
        await act(async () => render());
        const before = requests.length;
        await act(async () => dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange")));
        assert.equal(requests.length, before + 1);
        assert.equal(requests[before].method, "GET");
        await respond(before, "succeeded");
        assert.equal(requests.length, before + 1);
        assert.equal(statuses().length, 1);
        assert.match(statuses()[0].textContent!, /^Written summary added\./);
      }
      assert.deepEqual(errors, [], "React must not report duplicate child keys or reconciliation errors");
      assert.equal(JSON.stringify(result, null, 2), receipt);
      assert.equal(purchaseResultDownload(result, "receipt").content, receipt);
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      for (const key of Object.keys(globals)) {
        if (previous[key]) Object.defineProperty(globalThis, key, previous[key]!);
        else Reflect.deleteProperty(globalThis, key);
      }
    }
  });
}
