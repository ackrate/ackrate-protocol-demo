import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PurchaseReport, purchaseResultDownload, type PurchaseResult } from "../components/wallet/AssistantThread";
import type { MarketBrief } from "../lib/wallet/market-brief";
import type { Agent402Evidence } from "../lib/wallet/marketplace-types";

const brief: MarketBrief = {
  kicker: "SOURCE OVERVIEW",
  title: "Stellar, explained simply",
  subtitle: "A local report fixture for presentation checks.",
  opening: "The purchased source introduces the Stellar network. [1]",
  findings: [{ number: "01", title: "What the source says", body: "The source describes payments and assets. [1]" }],
  takeaway: "Read the original source for more detail. [1]",
  methodology: "Local fixture; no service or model was called.",
  sources: [{ publisher: "Stellar", title: "Stellar overview", url: "https://stellar.org/learn" }],
  editorialPasses: 1,
};

const evidence: Agent402Evidence = {
  query: "What is Stellar?", count: 1,
  results: [{ title: "Stellar overview", url: "https://stellar.org/learn", description: "A source fixture about payments and assets.", age: null }],
  untrustedContent: true,
  discovery: { marketplace: "Agent402", marketplaceUrl: "https://agent402.tools/stellar", seller: "fixture-seller", sellerName: "Fixture seller", route: "/api/search", serviceUrl: "https://example.com/api/search", health: 1 },
  settlement: { transaction: "b".repeat(64), network: "stellar:pubnet", amountAtomic: "200000", amount: "0.02", asset: "USDC", payTo: "fixture-recipient", payer: null, idempotencyKey: "local-fixture-only" },
  trustlineTransaction: null,
};

const summary = [
  "Stellar is a network for moving value, according to this source. [1]",
  "Its payment and asset features are the main ideas in the purchased evidence. [1]",
  "Start with the linked overview, and use it to decide what to explore next. [1]",
];

function purchase(extra: Record<string, unknown> = {}): PurchaseResult {
  return {
    source: { id: "agent402-research", title: "Web search" },
    payment: { status: "settled", amount: "0.02", asset: "USDC", txHash: "a".repeat(64), mandateId: "c".repeat(64) },
    delivered: { brief: { ...brief, ...extra }, marketplace: evidence },
  };
}

function render(result: PurchaseResult) {
  return renderToStaticMarkup(createElement(PurchaseReport, {
    result, explorerNetwork: "public", registryId: "fixture-registry", autoScroll: false,
  }));
}

function closingSection(markup: string) {
  return /<section class="brief-plain-english"[^>]*>([\s\S]*?)<\/section>/.exec(markup)?.[1];
}

test("a closing summary renders three separate cited paragraphs after takeaway and before method", () => {
  const markup = render(purchase({ summary }));
  const section = closingSection(markup);
  assert.ok(section);
  assert.match(section, /<h3>In plain English<\/h3>/);
  assert.equal((section.match(/<p>/g) ?? []).length, 3);
  assert.equal((section.match(/aria-label="Source 1: Stellar overview"/g) ?? []).length, 3);
  assert.equal((section.match(/href="https:\/\/stellar.org\/learn"/g) ?? []).length, 3);
  assert.ok(markup.indexOf("brief-takeaway") < markup.indexOf("brief-plain-english"));
  assert.ok(markup.indexOf("brief-plain-english") < markup.indexOf("brief-methodology"));
});

test("four paragraphs and the 1200-character boundary remain readable", () => {
  const paragraphs = [...summary, "x".repeat(1200)];
  const section = closingSection(render(purchase({ summary: paragraphs })));
  assert.ok(section);
  assert.equal((section.match(/<p>/g) ?? []).length, 4);
  assert.ok(section.includes(paragraphs[3]));
});

test("Markdown includes the same closing paragraphs under a separate heading", () => {
  const result = purchase({ summary });
  const download = purchaseResultDownload(result, "report");
  assert.equal(download.mimeType, "text/markdown;charset=utf-8");
  assert.match(download.filename, /-report\.md$/);
  assert.ok(download.content.includes(`## In plain English\n\n${summary.join("\n\n")}`));
  assert.ok(download.content.indexOf("## Takeaway") < download.content.indexOf("## In plain English"));
  assert.ok(download.content.indexOf("## In plain English") < download.content.indexOf("Method:"));
  assert.ok(download.content.includes(brief.sources[0].url));
  assert.ok(download.content.includes(result.payment.txHash));
});

test("legacy reports without a summary keep the report and download without invented text", () => {
  const result = purchase();
  const markup = render(result);
  assert.ok(markup.includes(brief.title));
  assert.ok(markup.includes(brief.findings[0].title));
  assert.match(markup, /Download report/);
  assert.equal(closingSection(markup), undefined);
  assert.doesNotMatch(purchaseResultDownload(result, "report").content, /## In plain English/);
});

test("invalid optional summaries are ignored without hiding an otherwise valid paid report", () => {
  const invalid = [
    null, "Not an array", {}, [], summary.slice(0, 2), [...summary, "Fourth", "Fifth"],
    [summary[0], "  \n ", summary[2]], [summary[0], 42, summary[2]],
    [summary[0], "x".repeat(1201), summary[2]], [summary[0], ["Nested text"], summary[2]],
  ];
  for (const value of invalid) {
    const result = purchase({ summary: value });
    const original = JSON.stringify(result, null, 2);
    const markup = render(result);
    assert.ok(markup.includes(brief.title));
    assert.ok(markup.includes(brief.findings[0].title));
    assert.match(markup, /Download report/);
    assert.equal(closingSection(markup), undefined);
    const report = purchaseResultDownload(result, "report");
    assert.match(report.filename, /-report\.md$/);
    assert.doesNotMatch(report.content, /## In plain English/);
    assert.ok(report.content.includes(brief.takeaway));
    assert.equal(purchaseResultDownload(result, "receipt").content, original);
    assert.equal(JSON.stringify(result, null, 2), original);
  }
});

test("summary rendering escapes markup while keeping plain-text citation links", () => {
  const result = purchase({ summary: ["<script>untrusted()</script> [1]", ...summary.slice(1)] });
  const section = closingSection(render(result));
  assert.ok(section);
  assert.doesNotMatch(section, /<script>/);
  assert.match(section, /&lt;script&gt;untrusted\(\)&lt;\/script&gt;/);
  assert.match(section, /aria-label="Source 1: Stellar overview"/);
});

test("presentation trimming never mutates the exact downloaded receipt", () => {
  const paragraphs = summary.map((paragraph) => `  ${paragraph}  `);
  const result = purchase({ summary: paragraphs });
  const original = JSON.stringify(result, null, 2);
  render(result);
  const report = purchaseResultDownload(result, "report");
  assert.ok(report.content.includes(`## In plain English\n\n${summary.join("\n\n")}`));
  assert.equal(purchaseResultDownload(result, "receipt").content, original);
  assert.equal(JSON.stringify(result, null, 2), original);
});
