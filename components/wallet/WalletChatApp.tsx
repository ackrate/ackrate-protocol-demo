"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  TriangleAlert,
  WalletCards,
  X,
} from "lucide-react";
import type { SafeAppConfig, SessionView } from "@/lib/wallet/types";
import { connectFreighter, signFreighterTransaction } from "@/lib/wallet/freighter";

const emptySession: SessionView = { authenticated: false, address: null, network: null, expiresAt: null };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json() as { ok: boolean; error?: string } & T;
  if (!response.ok || !body.ok) throw new Error(body.error ?? `Request failed with HTTP ${response.status}`);
  return body;
}

function short(value: string | null | undefined, size = 7): string {
  return value ? `${value.slice(0, size)}…${value.slice(-size)}` : "Not connected";
}

export function WalletChatApp() {
  const [config, setConfig] = useState<SafeAppConfig | null>(null);
  const [session, setSession] = useState<SessionView>(emptySession);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ config: SafeAppConfig }>("/api/wallet/config"),
      api<{ session: SessionView }>("/api/wallet/auth/session"),
    ]).then(([configResult, sessionResult]) => {
      setConfig(configResult.config);
      setSession(sessionResult.session);
      setWalletAddress(sessionResult.session.address);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  const connectAndVerify = async () => {
    if (!config) return;
    setBusy(true);
    setError(null);
    setNotice("Open Freighter and follow the prompts.");
    try {
      const address = await connectFreighter(config.networkPassphrase);
      setWalletAddress(address);
      if (address === config.contractAuthorityAddress) throw new Error("governance-wallet");

      const challenge = await api<{ transactionXdr: string }>("/api/wallet/auth/challenge", {
        method: "POST",
        body: JSON.stringify({ address }),
      });
      const signedTransactionXdr = await signFreighterTransaction(
        challenge.transactionXdr,
        address,
        config.networkPassphrase,
      );
      const verified = await api<{ session: SessionView }>("/api/wallet/auth/verify", {
        method: "POST",
        body: JSON.stringify({ signedTransactionXdr }),
      });
      setSession(verified.session);
      setNotice("Wallet connected and verified. Nothing was sent to Mainnet.");
    } catch (cause) {
      if (cause instanceof Error && cause.message === "governance-wallet") {
        setError("That is the contract governance account. Connect a personal Mainnet wallet instead.");
      } else {
        setError("Could not connect and verify. Open Freighter, choose Mainnet, and try again.");
      }
      setNotice(null);
    } finally {
      setBusy(false);
    }
  };

  const connected = session.authenticated && Boolean(session.address);
  const explorer = config ? `https://stellar.expert/explorer/${config.explorerNetwork}` : "#";

  return (
    <main className="wallet-preview wallet-flow">
      <header className="flow-header">
        <Link href="/" className="flow-brand"><span>R</span><strong>ACKRATE</strong></Link>
        <div className="flow-network"><span />{config?.networkLabel ?? "Loading Mainnet"}</div>
        <Link className="flow-text-button" href="/wallet/diagnostics">Verification <ArrowUpRight size={13} /></Link>
      </header>

      <section className="flow-shell">
        <div className="flow-intro">
          <p>MAINNET RESEARCH AGENT</p>
          <h1>Pay for better research.<br />Stay inside your limit.</h1>
          <span>One guided flow. Every payment is checked by the contract.</span>
        </div>

        <nav className="flow-progress" aria-label="Workflow progress">
          <div className={connected ? "done" : "current"}><span>{connected ? <Check size={14} /> : 1}</span><strong>Connect</strong><ChevronRight size={15} /></div>
          <div><span>2</span><strong>Marketplace</strong><ChevronRight size={15} /></div>
          <div><span>3</span><strong>Limit</strong><ChevronRight size={15} /></div>
          <div><span>4</span><strong>Research</strong><ChevronRight size={15} /></div>
          <div><span>5</span><strong>Verify</strong></div>
        </nav>

        <section className="flow-card">
          {!connected ? (
            <div className="flow-stage connect-stage">
              <div className="flow-stage-icon"><WalletCards size={25} /></div>
              <p className="flow-kicker">STEP 1 OF 5</p>
              <h2>Connect your wallet</h2>
              <p className="flow-description">Use a personal Freighter wallet on Stellar Mainnet. We verify that you control it without broadcasting a transaction.</p>
              <div className="flow-checklist">
                <span><Check size={14} />Mainnet wallet</span>
                <span><Check size={14} />Circle USDC</span>
                <span><Check size={14} />No charge to connect</span>
              </div>
              {walletAddress === config?.contractAuthorityAddress && (
                <div className="flow-alert"><TriangleAlert size={16} />Use a personal wallet, not the contract governance account.</div>
              )}
              <button className="flow-primary" type="button" onClick={connectAndVerify} disabled={!config || busy}>
                {busy ? <LoaderCircle className="spin" size={17} /> : <WalletCards size={17} />}
                {busy ? "Waiting for Freighter…" : "Connect Freighter"}
              </button>
              <small className="flow-footnote"><LockKeyhole size={12} />Freighter may show a connection prompt and a verification signature.</small>
            </div>
          ) : (
            <div className="flow-stage connect-stage flow-success">
              <div className="flow-stage-icon success"><Check size={25} /></div>
              <p className="flow-kicker">STEP 1 COMPLETE</p>
              <h2>Wallet connected</h2>
              <p className="flow-description">Your wallet is verified and ready for the next step. No transaction was broadcast and no funds moved.</p>
              <div className="connected-address"><span>CONNECTED WALLET</span><code>{short(session.address, 10)}</code><ShieldCheck size={17} /></div>
              <div className="next-step-placeholder"><span>Next</span><strong>Choose a marketplace service</strong><small>Step 2 is intentionally not live yet.</small></div>
            </div>
          )}
        </section>

        <div className="flow-under-card">
          <span><ShieldCheck size={14} />2-of-3 governed MandateRegistry V2</span>
          <a href={config?.mandateRegistryId ? `${explorer}/contract/${config.mandateRegistryId}` : "#"} target="_blank" rel="noreferrer">View contract <ArrowUpRight size={13} /></a>
        </div>
      </section>

      {(notice || error) && (
        <div className={`flow-toast ${error ? "error" : ""}`} role={error ? "alert" : "status"}>
          <span>{error ? <TriangleAlert size={15} /> : <Check size={15} />}</span>
          <p>{error ?? notice}</p>
          <button type="button" onClick={() => { setError(null); setNotice(null); }} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}
    </main>
  );
}
