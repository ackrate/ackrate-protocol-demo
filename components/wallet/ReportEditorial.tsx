import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import type { MarketBrief } from "../../lib/wallet/market-brief";

function CitedText({ text, sources }: { text: string; sources: MarketBrief["sources"] }) {
  return <>{text.split(/(\[\d+\])/).map((part, index) => {
    const citation = /^\[(\d+)\]$/.exec(part);
    const source = citation ? sources[Number(citation[1]) - 1] : undefined;
    return source ? <a key={index} href={source.url} target="_blank" rel="noopener noreferrer"
      referrerPolicy="no-referrer" aria-label={`Source ${citation![1]}: ${source.title}`}>{part}</a> : part;
  })}</>;
}

/** The same editorial content in the wallet and the read-only public snapshot. */
export function ReportEditorial({ brief, titleId, standalone = false, paymentLabel, children }: {
  brief: MarketBrief;
  titleId: string;
  standalone?: boolean;
  paymentLabel?: ReactNode;
  children?: ReactNode;
}) {
  const Title = standalone ? "h1" : "h2";
  const Heading = standalone ? "h2" : "h3";
  return <>
    <header className="brief-header">
      <div className="brief-kicker"><span />{brief.kicker}</div>
      <Title id={titleId}>{brief.title}</Title>
      <p><CitedText text={brief.subtitle} sources={brief.sources} /></p>
      <div className="brief-meta">
        <span>LIVE WEB EVIDENCE</span>
        {paymentLabel}
        {!standalone && <span>{brief.editorialPasses === 2 ? "TWO-MODEL REVIEW" : brief.editorialPasses === 1 ? "MODEL REVIEW" : "SOURCE-ONLY BRIEF"}</span>}
      </div>
    </header>
    <div className="brief-body">
      <p className="brief-opening"><CitedText text={brief.opening} sources={brief.sources} /></p>
      <div className="brief-findings">
        {brief.findings.map((finding) => <section className="brief-finding" key={`${finding.number}:${finding.title}`}>
          <span>{finding.number}</span>
          <div><Heading>{finding.title}</Heading><p><CitedText text={finding.body} sources={brief.sources} /></p></div>
        </section>)}
      </div>
      <aside className="brief-takeaway"><span>THE TAKEAWAY</span><p><CitedText text={brief.takeaway} sources={brief.sources} /></p></aside>
      {brief.summary && <section className="brief-plain-english" aria-label="Summary">
        <Heading>Summary</Heading>
        {brief.summary.map((paragraph, index) => <p key={index}><CitedText text={paragraph} sources={brief.sources} /></p>)}
      </section>}
      {brief.methodology && <p className="brief-methodology">Method: <CitedText text={brief.methodology} sources={brief.sources} /></p>}
      {children}
    </div>
  </>;
}

export function ReportSources({ sources, description }: { sources: MarketBrief["sources"]; description: string }) {
  return <aside className="report-rail report-source-rail" aria-label="Research sources">
    <div className="report-sources-head"><small>SOURCES</small><strong>Source evidence</strong><p>{description}</p></div>
    <ol>{sources.map((source, index) => <li key={`${index}:${source.url}`}>
      <span>{String(index + 1).padStart(2, "0")}</span>
      <a href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
        <b>{source.publisher}</b><small>{source.title}</small>
      </a>
      <ArrowUpRight size={14} aria-hidden="true" />
    </li>)}</ol>
  </aside>;
}
