"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  Fingerprint,
  LockKeyhole,
  LoaderCircle,
  Power,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import type { IntentMandate } from "@ackrate/core";
import { approveWithFreighter, buildMandate, registerWithFreighter, revokeWithFreighter } from "@/lib/wallet/mandate-client";
import type { MandateView, SafeAppConfig, SessionView } from "@/lib/wallet/types";
import { addTokenToFreighter, connectFreighter, signFreighterTransaction } from "@/lib/wallet/freighter";
import { AssistantThread } from "./AssistantThread";

type Phase = "idle" | "authenticating" | "adding-asset" | "registering" | "approving" | "active" | "revoking";

interface StoredMandate {
  id: string;
  user: string;
  agent: string;
  merchant: string;
  asset: string;
  maxAmount: string;
  expiry: number;
  decimals: number;
  registrationTx?: string;
  allowanceTx?: string;
  revokeTx?: string;
}

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

const short = (value: string | null | undefined, size = 7) => value ? `${value.slice(0, size)}…${value.slice(-size)}` : "Not configured";

function TransactionEvidence({ label, hash, explorer }: { label: string; hash: string; explorer: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="proof-evidence">
      <span>{label}</span>
      <code>{short(hash, 6)}</code>
      <button type="button" onClick={async () => {
        await navigator.clipboard.writeText(hash);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1_500);
      }} aria-label={`Copy ${label.toLowerCase()} transaction hash`} title="Copy transaction hash">
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer" aria-label={`Open ${label.toLowerCase()} transaction in Stellar Explorer`} title="Open in Stellar Explorer">
        <ArrowUpRight size={13} /> View transaction
      </a>
    </div>
  );
}

function formatUnits(value: string, decimals: number): string {
  const raw = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = (raw % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function storedToIntent(stored: StoredMandate): IntentMandate {
  return {
    ...stored,
    idBuffer: Buffer.from(stored.id, "hex"),
    maxAmount: BigInt(stored.maxAmount),
  };
}

export function WalletChatApp() {
  const [config, setConfig] = useState<SafeAppConfig | null>(null);
  const [session, setSession] = useState<SessionView>(emptySession);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [stored, setStored] = useState<StoredMandate | null>(null);
  const [mandate, setMandate] = useState<MandateView | null>(null);
  const [budget, setBudget] = useState("0.03");
  const [duration, setDuration] = useState("60");
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1_000));

  const refreshMandate = useCallback(async (current: StoredMandate) => {
    const body = await api<{ mandate: MandateView }>("/api/wallet/mandate/status", {
      method: "POST",
      body: JSON.stringify({ mandateId: current.id }),
    });
    setMandate(body.mandate);
    setPhase(body.mandate.status === "Active" && body.mandate.expiry > Math.floor(Date.now() / 1_000) ? "active" : "idle");
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1_000)), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    Promise.all([
      api<{ config: SafeAppConfig }>("/api/wallet/config"),
      api<{ session: SessionView }>("/api/wallet/auth/session"),
    ]).then(([configResult, sessionResult]) => {
      setConfig(configResult.config);
      setSession(sessionResult.session);
      if (sessionResult.session.address) setWalletAddress(sessionResult.session.address);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  useEffect(() => {
    if (!config || !session.authenticated || !session.address) return;
    const key = `ackrate:mandate:${config.network}:${session.address}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as StoredMandate;
      if (parsed.user !== session.address || !/^[0-9a-f]{64}$/.test(parsed.id)) throw new Error("invalid stored mandate");
      setStored(parsed);
      if (parsed.registrationTx) void refreshMandate(parsed).catch(() => undefined);
    } catch {
      localStorage.removeItem(key);
    }
  }, [config, session, refreshMandate]);

  useEffect(() => {
    const refresh = () => { if (stored) void refreshMandate(stored); };
    window.addEventListener("ackrate-mandate-updated", refresh);
    return () => window.removeEventListener("ackrate-mandate-updated", refresh);
  }, [refreshMandate, stored]);

  const saveStored = useCallback((value: StoredMandate) => {
    if (!config) return;
    localStorage.setItem(`ackrate:mandate:${config.network}:${value.user}`, JSON.stringify(value));
    setStored(value);
  }, [config]);

  const connect = async () => {
    if (!config) return;
    setError(null);
    setNotice("Open Freighter and connect your wallet.");
    setPhase("authenticating");
    try {
      const address = await connectFreighter(config.networkPassphrase);
      setWalletAddress(address);
      const challenge = await api<{ transactionXdr: string }>("/api/wallet/auth/challenge", {
        method: "POST",
        body: JSON.stringify({ address }),
      });
      setNotice("Approve the sign-in request in Freighter. This does not send money.");
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
      setNotice("Wallet connected.");
      setPhase("idle");
    } catch (cause) {
      setError("Could not connect. Open Freighter, choose Mainnet, and try again.");
      setNotice(null);
      setPhase("idle");
    }
  };

  const activate = async () => {
    if (!config || !session.address || !config.ready) return;
    setError(null);
    try {
      const expiry = Math.floor(Date.now() / 1_000) + Number(duration) * 60;
      const intent = buildMandate(config, session.address, { budget, expiry });
      let next: StoredMandate = {
        id: intent.id,
        user: intent.user,
        agent: intent.agent,
        merchant: intent.merchant,
        asset: intent.asset,
        maxAmount: intent.maxAmount.toString(),
        expiry: intent.expiry,
        decimals: intent.decimals,
      };
      saveStored(next);
      setPhase("registering");
      setNotice("Approve your spending limit in Freighter.");
      const registrationTx = await registerWithFreighter(config, intent);
      next = { ...next, registrationTx };
      saveStored(next);
      setPhase("approving");
      setNotice("One more Freighter approval lets Ackrate use USDC within your limit.");
      const allowanceTx = await approveWithFreighter(config, intent);
      next = { ...next, allowanceTx };
      saveStored(next);
      await refreshMandate(next);
      setNotice("Spending is on. The agent cannot spend more than your limit.");
    } catch (cause) {
      setError("Could not finish setup. Open Freighter and follow the button on this screen.");
      setNotice("Setup stopped safely. Follow the button on the screen to continue.");
      setPhase("idle");
    }
  };

  const addUsdc = async () => {
    if (!config || config.network !== "mainnet") return;
    setError(null);
    setPhase("adding-asset");
    setNotice("Approve adding USDC in Freighter.");
    try {
      await addTokenToFreighter(config.asset.contractId, config.networkPassphrase);
      setNotice("USDC is ready in Freighter.");
    } catch (cause) {
      setError("Could not add USDC. Open Freighter and try again.");
      setNotice(null);
    } finally {
      setPhase("idle");
    }
  };

  const retryAllowance = async () => {
    if (!config || !stored) return;
    setError(null);
    setPhase("approving");
    try {
      const allowanceTx = await approveWithFreighter(config, storedToIntent(stored));
      const next = { ...stored, allowanceTx };
      saveStored(next);
      await refreshMandate(next);
      setNotice("Spending limit approved. The agent is ready.");
    } catch (cause) {
      setError("Could not finish the spending limit. Open Freighter and try again.");
      setPhase("idle");
    }
  };

  const revoke = async () => {
    if (!config || !stored) return;
    setError(null);
    setPhase("revoking");
    setNotice("Open Freighter, choose this wallet, and approve Turn off spending.");
    try {
      const address = await connectFreighter(config.networkPassphrase);
      if (address !== stored.user) throw new Error("Select the same wallet you connected to Ackrate");
      const revokeTx = await revokeWithFreighter(config, storedToIntent(stored));
      const next = { ...stored, revokeTx };
      saveStored(next);
      await refreshMandate(next);
      setNotice("Spending is off. Now click Disconnect wallet.");
    } catch (cause) {
      setError("Could not turn off spending. Open Freighter, select the same wallet, and try again.");
      setPhase("active");
    }
  };

  const goToTurnOff = () => {
    setNotice("Tap Turn off spending below, then approve in Freighter.");
    document.getElementById("turn-off-mandate")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const disconnect = async () => {
    if (mandate?.status === "Active" && mandate.expiry > Math.floor(Date.now() / 1_000)) {
      setNotice("First tap Turn off spending below. Then disconnect your wallet.");
      return;
    }

    setError(null);
    try {
      await api("/api/wallet/auth/session", { method: "DELETE", body: "{}" });
    } catch (cause) {
      setError("Could not disconnect. Please try again.");
      setNotice("Your wallet is still connected.");
      return;
    }

    if (config && session.address) {
      localStorage.removeItem(`ackrate:mandate:${config.network}:${session.address}`);
    }
    localStorage.removeItem("ackrate:mainnet:last-payment");
    setSession(emptySession);
    setWalletAddress(null);
    setMandate(null);
    setStored(null);
    setPhase("idle");
    setNotice("Wallet disconnected. Connect a wallet to start again.");
  };

  const mandateOnline = Boolean(mandate?.status === "Active" && mandate.expiry > nowSeconds);
  const storedFresh = Boolean(stored && stored.expiry > nowSeconds);
  const currentMandate = mandateOnline ? mandate : null;
  const progress = mandateOnline ? 3 : storedFresh && stored?.registrationTx ? 2 : session.authenticated ? 1 : 0;
  const remaining = currentMandate && config ? formatUnits(currentMandate.remaining, config.asset.decimals) : budget;
  const spent = currentMandate && config ? formatUnits(currentMandate.spent, config.asset.decimals) : "0";
  const usedPercent = currentMandate && BigInt(currentMandate.maxAmount) > 0n
    ? Number((BigInt(currentMandate.spent) * 10_000n) / BigInt(currentMandate.maxAmount)) / 100
    : 0;
  const expires = currentMandate?.expiry ?? (storedFresh ? stored?.expiry : undefined);
  const explorer = config ? `https://stellar.expert/explorer/${config.explorerNetwork}` : "#";
  const mandateBusy = phase === "registering" || phase === "approving";

  return (
    <main className="wallet-preview app-frame">
      <div className="aurora" aria-hidden />
      <header className="topbar">
        <Link href="/" className="brand"><span>R</span> ACKRATE</Link>
        <div className="topbar-center"><span className="pulse-dot" /> Wallet & payments</div>
        <div className="topbar-actions">
          <Link href="/wallet/diagnostics" className="nav-link">Diagnostics</Link>
          {session.authenticated ? (
            <button className="wallet-pill" onClick={mandateOnline ? goToTurnOff : disconnect} title="Disconnect wallet"><Power size={13} /> Disconnect wallet</button>
          ) : (
            <button className="wallet-pill" onClick={connect} disabled={!config || phase === "authenticating"}><WalletCards size={14} /> Connect wallet</button>
          )}
        </div>
      </header>

      <section className="hero shell">
        <div>
          <div className="status-chip"><Sparkles size={13} /> SAFE AGENT PAYMENTS</div>
          <h1>Choose what the agent can spend.<br /><span>Stay in control.</span></h1>
          <p>You choose the limit. Ackrate checks it before every payment.</p>
        </div>
        <div className="network-card glass">
          <div className="network-card-top">
            <span><Activity size={14} /> PAYMENT NETWORK</span>
            <b className={config?.ready ? "online" : "blocked"}>{config?.ready ? "READY" : "NOT READY"}</b>
          </div>
          <strong>{config?.networkLabel ?? "Loading network…"}</strong>
          <code>{short(config?.mandateRegistryId, 9)}</code>
          <div className="network-meta"><ShieldCheck size={14} /> {config?.asset.code ?? "Asset"} · $0.01 per purchase</div>
        </div>
      </section>

      <section className="steps shell" aria-label="Activation progress">
        {[
          [1, "Wallet", "Connect your wallet"],
          [2, "Spending", "Choose a limit"],
          [3, "Buy", "Pay with the agent"],
        ].map(([number, title, caption], index) => (
          <div className={`step ${progress >= Number(number) ? "complete" : ""}`} key={String(title)}>
            <span>{progress > Number(number) ? <Check size={15} /> : number}</span>
            <div><strong>{title}</strong><small>{caption}</small></div>
            {index < 2 && <ChevronRight className="step-chevron" size={17} />}
          </div>
        ))}
      </section>

      <section className="workspace shell">
        <aside className="control-column">
          <div className="panel glass wallet-panel">
            <div className="panel-heading"><div><p className="eyebrow">01 · WALLET</p><h2>Your wallet</h2></div><div className={`icon-tile ${session.authenticated ? "live" : ""}`}><WalletCards size={19} /></div></div>
            {session.authenticated ? (
              <div className="connected-state">
                <div className="identity-line"><span className="wallet-led" /><div><small>Connected wallet</small><code>{short(session.address, 9)}</code></div><ShieldCheck size={18} /></div>
                <p><LockKeyhole size={13} /> Your wallet is connected.</p>
                <button className={`disconnect-button ${mandateOnline ? "step-link" : ""}`} onClick={mandateOnline ? goToTurnOff : disconnect}>
                  <Power size={15} /> Disconnect wallet
                </button>
                {mandateOnline && <p className="disconnect-help">First turn off spending below. Then tap Disconnect wallet again.</p>}
                {config?.network === "mainnet" && (
                  <button className="secondary-button" onClick={addUsdc} disabled={phase === "adding-asset"}>
                    <CircleDollarSign size={15} /> {phase === "adding-asset" ? "Waiting for Freighter…" : "Add USDC to wallet"}
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="panel-copy">Connect your Freighter wallet to begin. Ackrate never sees your secret phrase.</p>
                <button className="primary-button" onClick={connect} disabled={!config || phase === "authenticating"}><WalletCards size={16} /> {phase === "authenticating" ? "Waiting for Freighter…" : "Connect wallet"}</button>
              </>
            )}
          </div>

          <div className={`panel glass mandate-panel ${!session.authenticated ? "muted" : ""}`}>
            <div className="panel-heading"><div><p className="eyebrow">02 · SPENDING</p><h2>Set a spending limit</h2></div><div className={`icon-tile ${mandateOnline ? "live" : ""}`}><Fingerprint size={19} /></div></div>
            {stored?.revokeTx && mandate?.status !== "Active" ? (
              <div className="mandate-active">
                <div className="active-banner mandate-off"><span><Check size={15} /></span><div><small>Status</small><strong>Spending is off</strong></div></div>
                <p className="shutdown-copy">The agent cannot spend now.</p>
                <TransactionEvidence label="Spending turned off" hash={stored.revokeTx} explorer={explorer} />
                <button className="disconnect-button" onClick={disconnect}><Power size={15} /> Disconnect wallet</button>
              </div>
            ) : !currentMandate ? (
              <>
                <label>How much can the agent spend?<div className="money-input"><span>{config?.asset.code ?? "ASSET"}</span><input value={budget} onChange={(event) => setBudget(event.target.value)} inputMode="decimal" disabled={!session.authenticated || Boolean(storedFresh && stored?.registrationTx)} /></div></label>
                <label>How long should it last?<select value={duration} onChange={(event) => setDuration(event.target.value)} disabled={!session.authenticated || Boolean(storedFresh && stored?.registrationTx)}><option value="30">30 minutes</option><option value="60">1 hour</option><option value="360">6 hours</option><option value="1440">24 hours</option></select></label>
                <div className="scope-box"><div><span>Agent wallet</span><code>{short(config?.agentAddress, 6)}</code></div><div><span>Who gets paid</span><code>{config?.merchant.name ?? "Not configured"}</code></div><div><span>Money used</span><code>{config?.asset.code ?? "—"}</code></div></div>
                {stored?.registrationTx && !stored.allowanceTx ? (
                  <button className="primary-button" onClick={retryAllowance} disabled={phase === "approving"}><RefreshCw size={16} /> {phase === "approving" ? "Waiting for Freighter…" : "Finish setup"}</button>
                ) : (
                  <button className={`primary-button ${mandateBusy ? "busy" : ""}`} onClick={activate} disabled={!session.authenticated || !config?.ready || mandateBusy}>
                    {mandateBusy ? <LoaderCircle className="activation-spinner" size={17} /> : <Zap size={16} />}
                    {phase === "registering" ? "Saving your limit…" : phase === "approving" ? "Finishing setup…" : "Approve spending limit"}
                  </button>
                )}
                {mandateBusy && (
                  <div className="activation-progress" role="status" aria-live="polite">
                    <span className="activation-orbit" aria-hidden><i /><i /><i /></span>
                    <span><strong>Preparing Freighter</strong><small>Keep this window open. Freighter will ask you to approve.</small></span>
                  </div>
                )}
                <p className="fine-print"><ShieldCheck size={12} /> The agent cannot spend more than this limit.</p>
              </>
            ) : (
              <div className="mandate-active">
                <div className="active-banner"><span><Check size={15} /></span><div><small>Status</small><strong>Spending is on</strong></div></div>
                <div className="mandate-id"><span>Spending limit ID</span><code>{short(currentMandate.id, 9)}</code></div>
                <p className="shutdown-copy">Turn off spending before you disconnect your wallet.</p>
                <button id="turn-off-mandate" className="danger-button" onClick={revoke} disabled={phase === "revoking"}><X size={15} /> {phase === "revoking" ? "Waiting for Freighter…" : "Turn off spending"}</button>
              </div>
            )}
          </div>
        </aside>

        <section className="panel glass chat-panel">
          <div className="chat-head">
            <div className="agent-title"><div className="agent-orb"><Bot size={21} /></div><div><p className="eyebrow">03 · BUY</p><h2>Buy a research brief</h2></div></div>
            <div className={`agent-status ${mandateOnline ? "online" : ""}`}><span /> {mandateOnline ? "READY TO BUY" : "SET UP FIRST"}</div>
          </div>
          {mandateOnline && mandate && config ? (
            <AssistantThread mandateId={mandate.id} asset={config.asset.code} explorerNetwork={config.explorerNetwork} />
          ) : (
            <div className="chat-locked">
              <div className="lock-rings"><LockKeyhole size={27} /></div>
              <p className="eyebrow">NOT READY</p>
              <h3>Connect your wallet first.</h3>
              <p>Connect your wallet and approve a spending limit. Then you can buy.</p>
            </div>
          )}
        </section>

        <aside className="evidence-column">
          <div className="panel glass authority-card">
            <div className="panel-heading"><div><p className="eyebrow">SPENDING</p><h2>Your limit</h2></div><CircleDollarSign size={20} /></div>
            <div className="remaining"><span>Remaining</span><strong>{remaining} <small>{config?.asset.code ?? ""}</small></strong></div>
            <div className="meter"><span style={{ width: `${Math.min(100, usedPercent)}%` }} /></div>
            <div className="budget-row"><div><span>Spent</span><strong>{spent}</strong></div><div><span>Limit</span><strong>{currentMandate && config ? formatUnits(currentMandate.maxAmount, config.asset.decimals) : budget}</strong></div></div>
            <div className="authority-list">
              <div><Clock3 size={14} /><span>Expires</span><strong>{expires ? new Date(expires * 1_000).toLocaleString() : "Not signed"}</strong></div>
              <div><Fingerprint size={14} /><span>Payments made</span><strong>{currentMandate?.seq ?? 0}</strong></div>
              <div><Database size={14} /><span>Saved</span><strong>{config?.durableState ? "Yes" : "Not yet"}</strong></div>
            </div>
          </div>

          <div className="panel glass proof-card">
            <div className="panel-heading"><div><p className="eyebrow">TRANSACTIONS</p><h2>View on Stellar</h2></div><ExternalLink size={18} /></div>
            <a href={config?.mandateRegistryId ? `${explorer}/contract/${config.mandateRegistryId}` : "#"} target="_blank" rel="noreferrer"><span>Payment contract</span><code>{short(config?.mandateRegistryId, 6)}</code><ArrowUpRight size={14} /></a>
            {stored?.registrationTx && <TransactionEvidence label="Spending limit" hash={stored.registrationTx} explorer={explorer} />}
            {stored?.allowanceTx && <TransactionEvidence label="USDC approval" hash={stored.allowanceTx} explorer={explorer} />}
            {stored?.revokeTx && <TransactionEvidence label="Spending turned off" hash={stored.revokeTx} explorer={explorer} />}
          </div>

          {config && !config.ready && (
            <div className="panel gate-card"><TriangleAlert size={18} /><div><strong>Not ready yet</strong><p>Please try again later.</p></div></div>
          )}
        </aside>
      </section>

      {(notice || error) && <div className={`toast ${error ? "error" : ""}`}><span>{error ? <TriangleAlert size={16} /> : <Check size={16} />}</span><p>{error ?? notice}</p><button onClick={() => { setError(null); setNotice(null); }} aria-label="Dismiss"><X size={14} /></button></div>}

      <footer className="footer shell"><div><ShieldCheck size={15} /> Your spending limit is checked every time</div><p>Ackrate decides if a payment is allowed.</p><Link href="/wallet/diagnostics">Technical details <ArrowUpRight size={13} /></Link></footer>
    </main>
  );
}
