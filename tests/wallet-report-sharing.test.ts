import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PurchaseReport, purchaseResultDownload, type PurchaseResult } from "../components/wallet/AssistantThread";
import { sharedReportBrief } from "../lib/wallet/shared-report";
import type { MarketBrief } from "../lib/wallet/market-brief";
import type { Agent402Evidence } from "../lib/wallet/marketplace-types";

const summary = [
  "Stellar connects people and services that move value. [1]",
  "The source describes how payments and assets work together. [2]",
  "Read the linked documentation before choosing what to build. [1] [2]",
];

const brief: MarketBrief = {
  kicker: "SOURCE OVERVIEW",
  title: "Understanding Stellar",
  subtitle: "A short explanation with links to the original sources.",
  opening: "Stellar supports moving value across its network. [1]",
  findings: [
    { number: "01", title: "Payments", body: "The network supports payments between accounts. [1]" },
    { number: "02", title: "Assets", body: "Applications can work with different assets. [2]" },
  ],
  takeaway: "Use the documentation to understand the underlying features. [2]",
  summary,
  methodology: "Local fixture only; no service, model, or payment was called.",
  sources: [
    { publisher: "Stellar", title: "Stellar overview", url: "https://stellar.org/learn" },
    { publisher: "Stellar Developers", title: "Stellar documentation", url: "https://developers.stellar.org/docs" },
  ],
  editorialPasses: 1,
};

const evidence: Agent402Evidence = {
  query: "What is Stellar?", count: 2,
  results: brief.sources.map((source) => ({ title: source.title, url: source.url, description: "Local source fixture.", age: null })),
  untrustedContent: true,
  discovery: {
    marketplace: "Agent402", marketplaceUrl: "https://agent402.tools/stellar",
    seller: "private-fixture-seller-id", sellerName: "Private fixture seller name",
    route: "/api/private-fixture-route", serviceUrl: "https://merchant.example/private-fixture-service", health: 1,
  },
  settlement: {
    transaction: "b".repeat(64), network: "stellar:pubnet", amountAtomic: "200000", amount: "0.02", asset: "USDC",
    payTo: "private-fixture-recipient", payer: "private-fixture-payer", idempotencyKey: "private-fixture-idempotency-key",
  },
  trustlineTransaction: "d".repeat(64),
};

function purchase(extra: Record<string, unknown> = {}): PurchaseResult {
  return {
    source: { id: "private-fixture-service-id", title: "Private fixture service label" },
    payment: { status: "settled", amount: "0.02", asset: "USDC", txHash: "a".repeat(64), mandateId: "c".repeat(64) },
    delivered: { brief: { ...brief, ...extra }, marketplace: evidence },
  };
}

function render(result: PurchaseResult) {
  return renderToStaticMarkup(createElement(PurchaseReport, {
    result, explorerNetwork: "public", registryId: "private-fixture-registry", autoScroll: false,
  }));
}

function freezeRecursively(value: unknown): void {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freezeRecursively(child);
  Object.freeze(value);
}

test("a public snapshot includes the full report, three closing paragraphs, and source citation URLs", () => {
  const snapshot = sharedReportBrief(brief);
  assert.ok(snapshot);
  for (const field of ["title", "subtitle", "opening", "takeaway", "methodology"] as const) {
    assert.equal(snapshot[field], brief[field]);
  }
  assert.deepEqual(snapshot.findings, brief.findings);
  assert.deepEqual(snapshot.sources, brief.sources);
  assert.deepEqual(snapshot.summary, summary);
});

test("sharing excludes receipt, wallet, and marketplace transaction metadata", () => {
  const result = purchase();
  const snapshot = sharedReportBrief({ ...brief, source: result.source, payment: result.payment, marketplace: evidence });
  assert.ok(snapshot);
  const text = JSON.stringify(snapshot);
  const privateValues = [
    result.source.id, result.source.title, result.payment.txHash, result.payment.mandateId,
    evidence.settlement.transaction, evidence.settlement.payer!, evidence.settlement.payTo,
    evidence.settlement.idempotencyKey, evidence.settlement.network, evidence.trustlineTransaction!,
    evidence.discovery.marketplace, evidence.discovery.marketplaceUrl, evidence.discovery.seller,
    evidence.discovery.sellerName, evidence.discovery.route, evidence.discovery.serviceUrl,
  ];
  for (const value of privateValues) assert.ok(!text.includes(value), `Share contains receipt metadata: ${value}`);
  assert.doesNotMatch(text, /Payment receipt|Contract transaction|Marketplace transaction|Mandate:|Amount:|0\.02 USDC/);
});

test("invalid report bodies are not replaced with a shareable raw receipt", () => {
  const invalidBriefs: unknown[] = [
    null, "not a report", {}, { ...brief, title: 42 }, { ...brief, findings: [null] },
    { ...brief, sources: [{ ...brief.sources[0], url: "javascript:alert(1)" }] },
    { ...brief, sources: [{ ...brief.sources[0], url: "https://user:password@example.com/source" }] },
  ];
  for (const value of invalidBriefs) {
    const result = purchase();
    result.delivered = { brief: value, marketplace: evidence };
    assert.equal(sharedReportBrief(value), null);
    assert.doesNotMatch(render(result), />Share report</);
  }
  assert.equal(sharedReportBrief(null), null);
});

test("sharing and rendering leave the exact saved source and receipt untouched", () => {
  const result = structuredClone(purchase({ summary: summary.map((paragraph) => `  ${paragraph}  `) }));
  const original = JSON.stringify(result, null, 2);
  freezeRecursively(result);
  assert.ok(sharedReportBrief((result.delivered as { brief: unknown }).brief));
  render(result);
  assert.equal(JSON.stringify(result, null, 2), original);
  assert.equal(purchaseResultDownload(result, "receipt").content, original);
});

test("legacy reports and invalid optional summaries share valid report text without inventing closing text", () => {
  for (const value of [undefined, [], [summary[0]], [summary[0], 42, summary[2]]]) {
    const snapshot = sharedReportBrief({ ...brief, summary: value });
    assert.ok(snapshot);
    assert.equal(snapshot.title, brief.title);
    assert.equal(snapshot.takeaway, brief.takeaway);
    assert.equal(snapshot.sources[0].url, brief.sources[0].url);
    assert.equal(snapshot.summary, undefined);
  }
});

test("Share report is at the end of the report body after Summary and method; downloads remain available", () => {
  const result = purchase();
  const markup = render(result);
  const article = /<article class="research-brief report-document">([\s\S]*?)<\/article>/.exec(markup)?.[1];
  assert.ok(article);
  const shareButtons = [...article.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map((match) => match[0])
    .filter((button) => button.includes("Share report"));
  assert.equal(shareButtons.length, 1);
  assert.match(shareButtons[0], /type="button"/);
  assert.ok(article.indexOf("brief-plain-english") < article.indexOf("Share report"));
  assert.ok(article.indexOf("brief-methodology") < article.indexOf("Share report"));
  assert.ok(article.indexOf(brief.methodology!) < article.indexOf("Share report"));
  assert.match(article, /Download report/);
  assert.match(article, /Receipt JSON/);
  assert.match(article, /Create a link anyone can open/);
  assert.match(article, /Wallet and payment details are not included/);
  assert.match(purchaseResultDownload(result, "report").filename, /-report\.md$/);
  assert.equal(purchaseResultDownload(result, "receipt").content, JSON.stringify(result, null, 2));
});

test("the share control requests a saved GUID page and copies its verified same-origin URL", () => {
  const source = readFileSync(new URL("../components/wallet/AssistantThread.tsx", import.meta.url), "utf8");
  const control = source.slice(source.indexOf("function ReportShareButton("), source.indexOf("export function PurchaseReport("));
  assert.match(control, /fetch\("\/api\/wallet\/reports\/share"/);
  assert.match(control, /method: "POST", credentials: "same-origin"/);
  assert.match(control, /JSON\.stringify\(\{ mandateId, txHash \}\)/);
  assert.match(control, /isSharedReportId\(body\.id\)/);
  assert.ok(control.includes("body.path !== `/reports/${body.id}`"));
  assert.match(control, /new URL\(body\.path, window\.location\.origin\)/);
  assert.match(control, /navigator\.clipboard\.writeText\(url\)/);
  assert.match(control, /aria-label="Shared report link" readOnly value=\{link\}/);
  assert.match(control, /if \(inFlight\.current\) return/);
  assert.doesNotMatch(control, /purchase_source|\/api\/wallet\/chat|purchaseReportShareText/);
});
