/** Test-only SSR fixture. No wallet, API, model, payment, or production route. */
import { readFile, mkdir, writeFile, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportEditorial, ReportSources } from "../../components/wallet/ReportEditorial";
import { SummaryRetryView, type SummaryRetryState } from "../../components/wallet/SummaryRetry";
import type { MarketBrief } from "../../lib/wallet/market-brief";

const directory = resolve(process.argv[2] ?? "/tmp/reapp-report-retry-fixture");
if (!directory.startsWith("/tmp/") && !directory.startsWith("/private/tmp/")) throw new Error("Write synthetic fixtures under /tmp only");
const states: SummaryRetryState[] = ["checking", "eligible", "connect", "connect_incomplete", "running", "succeeded", "failed", "used", "uncertain", "unavailable", "wrong_wallet", "temporarily_unavailable"];
const source = { publisher: "example.org", title: "Illustrative library guide", url: "https://example.org/library" };
const fallback: MarketBrief = {
  kicker: "SAVED RESEARCH", title: "How do library loans work?", subtitle: "An invented report for visual review.",
  opening: "This illustrative guide describes borrowing and returning library books. [1]",
  findings: [{ number: "01", title: "Borrowing a book", body: "A library lends a book for a set period. Its guide explains how to return it. [1]" }],
  takeaway: "Your search results are saved in Sources. A written summary is not available for this report, so follow the source links for the full context.",
  sources: [source], editorialPasses: 0,
};
const complete: MarketBrief = { ...fallback, editorialPasses: 1,
  summary: ["A library lends books for a set period. The local lending guide explains when borrowers must return them. [1]",
    "The guide describes borrowing and returning books. It is the source to consult before taking out a book. [1]",
    "Check the guide for the lending period and return process. This example makes no claim about fees or renewal rules. [1]"] };
const cssPaths = ["node_modules/tailwindcss/preflight.css", "app/brand-colors.css", "app/globals.css", "app/wallet/wallet.css",
  "app/wallet/wallet-monochrome.css", "app/wallet/wallet-flow.css", "app/wallet/wallet-flat.css"];
const css = (await Promise.all(cssPaths.map(async (path) => (await readFile(path, "utf8")).replace(/^@import .*;\s*$/gm, "")))).join("\n");
await mkdir(directory, { recursive: true });
await cp("public/fonts", resolve(directory, "fonts"), { recursive: true });
await writeFile(resolve(directory, "fixture.css"), css + "\n.fixture-header{padding:20px;display:grid;gap:10px}.fixture-header nav{display:flex;flex-wrap:wrap;gap:12px}.fixture-header a{text-decoration:underline}.fixture-header h1{font-size:20px;font-weight:600}");
for (const state of states) {
  const markup = renderToStaticMarkup(<main data-brand="foundation" className="wallet-preview wallet-flow wallet-flat">
    <header className="fixture-header"><h1>Synthetic review fixture · {state}</h1>
      <p>Invented sources and receipt labels. Static layout only; these controls do not call a service.</p>
      <nav aria-label="Fixture states">{states.map((item) => <a key={item} href={`${item}.html`}>{item}</a>)}</nav>
    </header>
    <div className="wallet-result-view"><section className="report-section"><div className="report-layout">
      <aside className="report-rail report-proof-rail" aria-label="Synthetic payment proof">
        <strong>Saved receipt</strong><p className="report-settlement-note">Synthetic receipt A</p><p className="report-settlement-note">Synthetic receipt B</p>
        <p className="report-settlement-note">Receipt labels stay unchanged in every state. No wallet or transaction data is present.</p>
      </aside>
      <article className="research-brief report-document">
        <div className="tool-output-toolbar"><strong>Report &amp; evidence</strong><button type="button">Download report</button><button type="button">Receipt JSON</button></div>
        <ReportEditorial brief={state === "succeeded" ? complete : fallback} titleId="fixture-report" summaryHeadingId="fixture-summary"
          summarySlot={<SummaryRetryView state={state} canReconnect statusId="retry-status" helpId="retry-help" />} />
      </article>
      <ReportSources sources={[source]} description="One invented source for this review." />
    </div></section></div>
  </main>);
  await writeFile(resolve(directory, `${state}.html`), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src data:;"><title>Synthetic report retry: ${state}</title><link rel="stylesheet" href="fixture.css"></head><body>${markup}</body></html>`);
}
console.log(`Synthetic fixtures written to ${directory}/eligible.html`);
