import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportEditorial, ReportSources } from "../components/wallet/ReportEditorial";
import { SharedReport } from "../components/wallet/SharedReport";
import type { MarketBrief } from "../lib/wallet/market-brief";
import { sharedReportBrief } from "../lib/wallet/shared-report";

const summary = [
  "Stellar connects people and services that move value. [1]",
  "Payments and assets are the main ideas in these sources. [2]",
  "Read the documentation to understand what to explore next. [1] [2]",
];

const brief: MarketBrief = {
  kicker: "SOURCE OVERVIEW",
  title: "Stellar, explained simply",
  subtitle: "A short introduction with original sources.",
  opening: "Stellar supports moving value across a network. [1]",
  findings: [
    { number: "01", title: "Payments", body: "The first source introduces network payments. [1]" },
    { number: "02", title: "Assets", body: "The second source explains asset features. [2]" },
  ],
  takeaway: "Read both sources to understand the features. [1] [2]",
  summary,
  methodology: "This is a local saved-report fixture.",
  sources: [
    { publisher: "Stellar", title: "Stellar overview", url: "https://stellar.org/learn" },
    { publisher: "Stellar Developers", title: "Documentation", url: "https://developers.stellar.org/docs" },
  ],
  editorialPasses: 1,
};

function render(value: MarketBrief = brief) {
  return renderToStaticMarkup(createElement(SharedReport, { brief: value }));
}

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("the public view contains the readable report, three-paragraph Summary, and original sources", () => {
  const markup = render();
  assert.match(markup, /<main class="shared-report-page">/);
  assert.match(markup, /<h1 id="shared-report-title">Stellar, explained simply<\/h1>/);
  assert.ok(markup.includes(brief.subtitle));
  for (const finding of brief.findings) assert.ok(markup.includes(`<h2>${finding.title}</h2>`));
  const section = /<section class="brief-plain-english" aria-label="Summary">([\s\S]*?)<\/section>/.exec(markup)?.[1];
  assert.ok(section);
  assert.match(section, /<h2>Summary<\/h2>/);
  assert.equal((section.match(/<p>/g) ?? []).length, 3);
  const orderedSections = ["brief-takeaway", "brief-plain-english", "brief-methodology", "report-source-rail"];
  for (const className of orderedSections) assert.ok(markup.includes(className));
  for (let index = 1; index < orderedSections.length; index++) {
    assert.ok(markup.indexOf(orderedSections[index - 1]) < markup.indexOf(orderedSections[index]));
  }
  assert.match(markup, /<aside class="report-rail report-source-rail" aria-label="Research sources">/);
  for (const source of brief.sources) {
    assert.ok(markup.includes(`href="${source.url}"`));
    assert.ok(markup.includes(source.title));
    assert.ok(markup.includes(source.publisher));
  }
});

test("wallet and public reports reuse the same editorial and source-sidebar components", () => {
  const markup = render();
  const publicBrief = sharedReportBrief(brief);
  assert.ok(publicBrief);
  const editorial = renderToStaticMarkup(createElement(ReportEditorial, {
    brief: publicBrief, titleId: "shared-report-title", standalone: true,
  }));
  const sources = renderToStaticMarkup(createElement(ReportSources, {
    sources: brief.sources, description: `${brief.sources.length} sources behind this report.`,
  }));
  assert.ok(markup.includes(editorial));
  assert.ok(markup.includes(sources));
  assert.match(markup, /<div class="shared-report-layout"><article class="research-brief report-document"/);
  assert.ok(markup.indexOf("</article>") < markup.indexOf('class="report-rail report-source-rail"'));

  for (const path of ["../components/wallet/AssistantThread.tsx", "../components/wallet/SharedReport.tsx"]) {
    const component = source(path);
    assert.match(component, /import\s*\{\s*ReportEditorial,\s*ReportSources\s*\}\s*from\s*["']\.\/ReportEditorial["']/);
    assert.match(component, /<ReportEditorial\s/);
    assert.match(component, /<ReportSources\s/);
  }
});

test("the public report loads its dark responsive stylesheet with a collapsing source sidebar", () => {
  const page = source("../app/reports/[id]/page.tsx");
  assert.match(page, /import\s*["']\.\.\/shared-report\.css["']/);
  const stylesheet = source("../app/reports/shared-report.css");
  const screenStyles = stylesheet.split("@media print")[0];
  const pageStyle = /\.shared-report-page\s*\{([^}]+)\}/.exec(screenStyles)?.[1];
  assert.ok(pageStyle);
  assert.match(pageStyle, /color-scheme:\s*dark/);
  assert.match(pageStyle, /background:\s*#000\b/);
  assert.match(screenStyles, /geist-latin-wght-normal\.woff2/);
  assert.match(screenStyles, /geist-mono-latin-wght-normal\.woff2/);
  assert.match(pageStyle, /min-height:\s*100svh/);
  assert.doesNotMatch(screenStyles, /\bbackground(?:-color)?:\s*(?:#fff(?:fff)?|white)\b/i);
  assert.match(screenStyles, /\.shared-report-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+\d+px/);
  const tabletStyles = screenStyles.split("@media (max-width: 900px)")[1]?.split("@media (max-width: 560px)")[0];
  const mobileStyles = screenStyles.split("@media (max-width: 560px)")[1];
  assert.ok(tabletStyles);
  assert.ok(mobileStyles);
  assert.match(tabletStyles, /\.shared-report-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(tabletStyles, /\.report-source-rail ol\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(mobileStyles, /\.report-source-rail ol\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test("citations link to their source without sending the report URL as a referrer", () => {
  const markup = render();
  assert.match(markup, /aria-label="Source 1: Stellar overview">\[1\]<\/a>/);
  assert.match(markup, /aria-label="Source 2: Documentation">\[2\]<\/a>/);
  const links = [...markup.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
  assert.ok(links.length > 2);
  for (const link of links) {
    assert.match(link, /rel="noopener noreferrer"/);
    assert.match(link, /referrerPolicy="no-referrer"/i);
    assert.match(link, /href="https:\/\//);
  }
});

test("the read-only report never adds a wallet, receipt, chat, or payment surface", () => {
  const value = {
    ...brief,
    payment: { txHash: "private-transaction", mandateId: "private-mandate", payer: "private-wallet" },
    marketplace: { seller: "private-seller", transaction: "private-marketplace-transaction" },
  };
  const markup = render(value);
  assert.doesNotMatch(markup, /private-transaction|private-mandate|private-wallet|private-seller|private-marketplace-transaction/);
  assert.doesNotMatch(markup, /<button\b|<form\b|<canvas\b|<iframe\b|Payment proof|Receipt JSON|Connect wallet|Payment verified/i);
  assert.doesNotMatch(markup, /Written by|Reviewed by|Generated by|Published by|SOURCE-ONLY BRIEF|MODEL REVIEW/);
});

test("source and report markup is escaped rather than interpreted as HTML", () => {
  const markup = render({
    ...brief,
    title: "<script>untrusted()</script>",
    opening: "<img src=x onerror=untrusted()> [1]",
    sources: [{ ...brief.sources[0], title: "<b>Source title</b>" }, brief.sources[1]],
  });
  assert.doesNotMatch(markup, /<script>|<img\b|<b>Source title<\/b>/);
  assert.match(markup, /&lt;script&gt;untrusted\(\)&lt;\/script&gt;/);
  assert.match(markup, /&lt;img src=x onerror=untrusted\(\)&gt;/);
  assert.match(markup, /&lt;b&gt;Source title&lt;\/b&gt;/);
});

test("unsafe source URLs cannot be exposed by the public view", () => {
  for (const url of ["javascript:alert(1)", "http://example.com/source", "https://user:password@example.com/source"]) {
    assert.equal(render({ ...brief, sources: [{ ...brief.sources[0], url }] }), "");
  }
});

test("a legacy report remains readable without an invented summary and rendering preserves the snapshot", () => {
  const value = structuredClone(brief);
  delete value.summary;
  const original = JSON.stringify(value);
  const markup = render(value);
  assert.ok(markup.includes(brief.title));
  assert.doesNotMatch(markup, /brief-plain-english|aria-label="Summary"/);
  assert.match(markup, /report-source-rail/);
  assert.equal(JSON.stringify(value), original);
});
