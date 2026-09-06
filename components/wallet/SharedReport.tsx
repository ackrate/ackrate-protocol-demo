import type { MarketBrief } from "../../lib/wallet/market-brief";
import { sharedReportBrief } from "../../lib/wallet/shared-report";

function CitedText({ text, sources }: { text: string; sources: MarketBrief["sources"] }) {
  return <>{text.split(/(\[\d+\])/).map((part, index) => {
    const citation = /^\[(\d+)\]$/.exec(part);
    const source = citation ? sources[Number(citation[1]) - 1] : undefined;
    return source ? <a key={index} href={source.url} target="_blank" rel="noopener noreferrer"
      referrerPolicy="no-referrer" aria-label={`Source ${citation![1]}: ${source.title}`}>{part}</a> : part;
  })}</>;
}

/** A read-only report snapshot. Payment and wallet records are never rendered here. */
export function SharedReport({ brief: value }: { brief: MarketBrief }) {
  const brief = sharedReportBrief(value);
  if (!brief) return null;

  return <main className="shared-report-page">
    <article className="shared-report-document" aria-labelledby="shared-report-title">
      <header className="shared-report-header">
        <p className="shared-report-label">Shared report</p>
        <h1 id="shared-report-title">{brief.title}</h1>
        {brief.subtitle && <p className="shared-report-subtitle">{brief.subtitle}</p>}
      </header>

      <div className="shared-report-body">
        <p className="shared-report-opening"><CitedText text={brief.opening} sources={brief.sources} /></p>
        {brief.findings.map((finding, index) => <section className="shared-report-finding" key={`${index}:${finding.number}`}>
          <h2>{finding.title}</h2>
          <p><CitedText text={finding.body} sources={brief.sources} /></p>
        </section>)}

        <section className="shared-report-takeaway" aria-labelledby="shared-report-takeaway-title">
          <h2 id="shared-report-takeaway-title">Takeaway</h2>
          <p><CitedText text={brief.takeaway} sources={brief.sources} /></p>
        </section>

        {brief.summary && <section className="shared-report-summary" aria-labelledby="shared-report-summary-title">
          <h2 id="shared-report-summary-title">Summary</h2>
          {brief.summary.map((paragraph, index) => <p key={index}><CitedText text={paragraph} sources={brief.sources} /></p>)}
        </section>}

        {brief.methodology && <section className="shared-report-method" aria-labelledby="shared-report-method-title">
          <h2 id="shared-report-method-title">Method</h2>
          <p><CitedText text={brief.methodology} sources={brief.sources} /></p>
        </section>}

        <section className="shared-report-sources" aria-labelledby="shared-report-sources-title">
          <h2 id="shared-report-sources-title">Sources</h2>
          <ol>
            {brief.sources.map((source, index) => <li key={`${index}:${source.url}`}>
              <span className="shared-report-source-number" aria-hidden="true">[{index + 1}]</span>
              <a href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                <strong>{source.title}</strong>
                {source.publisher && <span className="shared-report-publisher">{source.publisher}</span>}
                <span className="shared-report-source-url">{source.url}</span>
              </a>
            </li>)}
          </ol>
        </section>
      </div>
    </article>
  </main>;
}
