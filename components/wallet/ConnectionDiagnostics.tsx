"use client";

import { useEffect, useState } from "react";
import { buildConnectionReport, subscribeConnectionEvents } from "@/lib/wallet/connection-diagnostics";

export default function ConnectionDiagnostics({ sourceCommit, network, ready }: { sourceCommit?: string | null; network?: string; ready?: boolean }) {
  const [report, setReport] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    const refresh = () => setReport(JSON.stringify(buildConnectionReport({ sourceCommit, network, ready }), null, 2));
    refresh();
    return subscribeConnectionEvents(refresh);
  }, [sourceCommit, network, ready]);
  const share = async () => {
    setStatus("");
    try {
      if (navigator.share) {
        await navigator.share({ title: "REAPP wallet connection report", text: report });
        setStatus("Report shared.");
      } else {
        await navigator.clipboard.writeText(report);
        setStatus("Report copied. Paste it into your support conversation.");
      }
    } catch (cause) {
      setStatus(cause instanceof Error && cause.name === "AbortError" ? "Sharing cancelled." : "Sharing is unavailable here. Download the report instead.");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([report], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "reapp-wallet-connection.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("Report downloaded. Attach it to your support conversation.");
  };
  return <details className="connection-diagnostics">
    <summary>Troubleshoot wallet connection</summary>
    <p>This release connects to the desktop Freighter extension. Freighter Mobile requires WalletConnect, which is not configured here yet.</p>
    <p>On desktop, unlock Freighter and select Stellar Mainnet. Close any old connection request before retrying.</p>
    <p>The report contains connection steps, error codes, browser family, site and release. It excludes wallet addresses, signatures, keys, messages and transactions. Review it below; nothing is uploaded automatically.</p>
    <pre aria-label="Connection report">{report || "Preparing report…"}</pre>
    <div className="connection-diagnostics-actions">
      <button type="button" onClick={() => void share()} disabled={!report}>Share / copy report</button>
      <button type="button" onClick={download} disabled={!report}>Download report</button>
    </div>
    {status && <p role="status">{status}</p>}
    <a href="https://help.freighter.app/article/y848tzczm2-how-do-i-connect-to-dapps" target="_blank" rel="noreferrer">Freighter connection guide ↗</a>
  </details>;
}
