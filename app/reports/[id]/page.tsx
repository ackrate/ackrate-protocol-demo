import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { SharedReport } from "../../../components/wallet/SharedReport";
import { isSharedReportId } from "../../../lib/wallet/shared-report";
import { getSharedReport } from "../../../lib/wallet/shared-report-store";
import "../shared-report.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ReportPageProps = { params: Promise<{ id: string }> };

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true, themeColor: "#f4f3ef",
};

export async function generateMetadata({ params }: ReportPageProps): Promise<Metadata> {
  const { id } = await params;
  const canonical = isSharedReportId(id) ? `/reports/${id.toLowerCase()}` : null;
  return {
    title: { absolute: "Shared report" },
    description: "A shared report and its sources.",
    authors: null, creator: null, publisher: null, keywords: null,
    alternates: { canonical },
    referrer: "no-referrer",
    robots: {
      index: false, follow: false, noarchive: true, nosnippet: true, noimageindex: true,
      googleBot: { index: false, follow: false, noarchive: true, nosnippet: true, noimageindex: true },
    },
    openGraph: { title: "Shared report", description: "A shared report and its sources.", type: "website", url: canonical ?? undefined, images: [] },
    twitter: { card: "summary", title: "Shared report", description: "A shared report and its sources.", images: [] },
  };
}

export default async function SharedReportPage({ params }: ReportPageProps) {
  const { id } = await params;
  if (!isSharedReportId(id)) notFound();
  const report = await getSharedReport(id.toLowerCase());
  if (!report) notFound();
  return <SharedReport brief={report.brief} />;
}
