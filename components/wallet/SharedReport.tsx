import type { MarketBrief } from "../../lib/wallet/market-brief";
import { sharedReportBrief } from "../../lib/wallet/shared-report";
import { ReportEditorial, ReportSources } from "./ReportEditorial";

/** A read-only report snapshot. Payment and wallet records are never rendered here. */
export function SharedReport({ brief: value }: { brief: MarketBrief }) {
  const brief = sharedReportBrief(value);
  if (!brief) return null;

  return <main className="shared-report-page">
    <div className="shared-report-masthead"><span>ACKRATE</span><small>RESEARCH &amp; EVIDENCE</small></div>
    <div className="shared-report-layout">
      <article className="research-brief report-document" aria-labelledby="shared-report-title">
        <div className="tool-output-toolbar"><strong>Report &amp; evidence</strong><span>Shared report</span></div>
        <ReportEditorial brief={brief} titleId="shared-report-title" standalone />
      </article>
      <ReportSources sources={brief.sources} description={`${brief.sources.length} sources behind this report.`} />
    </div>
  </main>;
}
