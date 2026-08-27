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
    setNotice("Open Freighter and approve the connection request.");
    setPhase("authenticating");
    try {
      const address = await connectFreighter(config.networkPassphrase);
      setWalletAddress(address);
      const challenge = await api<{ transactionXdr: string }>("/api/wallet/auth/challenge", {
        method: "POST",
        body: JSON.stringify({ address }),
      });
      setNotice("Approve the non-broadcast authentication transaction in Freighter.");
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
      setNotice("Freighter verified. Your session is bound to this wallet and network.");
      setPhase("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
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
      setNotice("Review and approve the mandate registration in Freighter.");
      const registrationTx = await registerWithFreighter(config, intent);
      next = { ...next, registrationTx };
      saveStored(next);
      setPhase("approving");
      setNotice("One final Freighter approval: allowance goes to MandateRegistry, never the agent.");
      const allowanceTx = await approveWithFreighter(config, intent);
      next = { ...next, allowanceTx };
      saveStored(next);
      await refreshMandate(next);
      setNotice("Mandate active. The agent can spend only inside the on-chain envelope.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setNotice("The flow stopped safely. Any completed on-chain step is retained for recovery.");
      setPhase("idle");
    }
  };

  const addUsdc = async () => {
    if (!config || config.network !== "mainnet") return;
    setError(null);
    setPhase("adding-asset");
    setNotice("Approve adding Circle USDC in Freighter.");
    try {
      await addTokenToFreighter(config.asset.contractId, config.networkPassphrase);
      setNotice("USDC is available in Freighter. Swap a small amount of XLM to USDC, then return here.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
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
      setNotice("Allowance confirmed. Mandate is ready for the agent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase("idle");
    }
  };

  const revoke = async () => {
    if (!config || !stored) return;
    setError(null);
    setPhase("revoking");
    try {
      const revokeTx = await revokeWithFreighter(config, storedToIntent(stored));
      const next = { ...stored, revokeTx };
      saveStored(next);
      await refreshMandate(next);
      setNotice("Mandate revoked on-chain. The agent cannot make another payment.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase("active");
    }
  };

  const disconnect = async () => {
    await api("/api/wallet/auth/session", { method: "DELETE", body: "{}" }).catch(() => undefined);
    setSession(emptySession);
    setWalletAddress(null);
    setMandate(null);
    setStored(null);
    setPhase("idle");
    setNotice(null);
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
        <div className="topbar-center"><span className="pulse-dot" /> Mandate control room</div>
        <div className="topbar-actions">
          <Link href="/wallet/diagnostics" className="nav-link">Diagnostics</Link>
          {session.authenticated ? (
            <button className="wallet-pill" onClick={disconnect}><span className="wallet-led" /> {short(session.address, 5)} <Power size={13} /></button>
          ) : (
            <button className="wallet-pill" onClick={connect} disabled={!config || phase === "authenticating"}><WalletCards size={14} /> Connect Freighter</button>
          )}
        </div>
      </header>

      <section className="hero shell">
        <div>
          <div className="status-chip"><Sparkles size={13} /> CONTRACT-ENFORCED AGENT PAYMENTS</div>
          <h1>Give the agent a budget.<br /><span>Keep the authority.</span></h1>
          <p>Sign with Freighter. MandateRegistry re-checks the agent, merchant, asset, expiry, and remaining budget every time value moves.</p>
        </div>
        <div className="network-card glass">
          <div className="network-card-top">
            <span><Activity size={14} /> NETWORK</span>
            <b className={config?.ready ? "online" : "blocked"}>{config?.ready ? "READY" : "GATED"}</b>
          </div>
          <strong>{config?.networkLabel ?? "Loading network…"}</strong>
          <code>{short(config?.mandateRegistryId, 9)}</code>
          <div className="network-meta"><ShieldCheck size={14} /> {config?.asset.code ?? "Asset"} · $0.01 per purchase</div>
        </div>
      </section>

      <section className="steps shell" aria-label="Activation progress">
        {[
          [1, "Wallet", "Authenticate with Freighter"],
          [2, "Mandate", "Register + approve"],
          [3, "Agent", "Chat + settle"],
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
            <div className="panel-heading"><div><p className="eyebrow">01 · WALLET</p><h2>Freighter authority</h2></div><div className={`icon-tile ${session.authenticated ? "live" : ""}`}><WalletCards size={19} /></div></div>
            {session.authenticated ? (
              <div className="connected-state">
                <div className="identity-line"><span className="wallet-led" /><div><small>Authenticated account</small><code>{short(session.address, 9)}</code></div><ShieldCheck size={18} /></div>
                <p><LockKeyhole size={13} /> Session verified by a signed, non-broadcast Stellar transaction.</p>
                <button className="disconnect-button" onClick={disconnect}>
                  <Power size={15} /> Disconnect wallet from Ackrate
                </button>
                {config?.network === "mainnet" && (
                  <button className="secondary-button" onClick={addUsdc} disabled={phase === "adding-asset"}>
                    <CircleDollarSign size={15} /> {phase === "adding-asset" ? "Waiting for Freighter…" : "Add Circle USDC"}
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="panel-copy">Connect Freighter on Mainnet. Signing stays inside Freighter; this app never receives your recovery phrase or secret key.</p>
                <button className="primary-button" onClick={connect} disabled={!config || phase === "authenticating"}><WalletCards size={16} /> {phase === "authenticating" ? "Waiting for Freighter…" : "Connect Freighter"}</button>
              </>
            )}
          </div>

          <div className={`panel glass mandate-panel ${!session.authenticated ? "muted" : ""}`}>
            <div className="panel-heading"><div><p className="eyebrow">02 · MANDATE</p><h2>Set the boundary</h2></div><div className={`icon-tile ${mandateOnline ? "live" : ""}`}><Fingerprint size={19} /></div></div>
            {!currentMandate ? (
              <>
                <label>Maximum spend<div className="money-input"><span>{config?.asset.code ?? "ASSET"}</span><input value={budget} onChange={(event) => setBudget(event.target.value)} inputMode="decimal" disabled={!session.authenticated || Boolean(storedFresh && stored?.registrationTx)} /></div></label>
                <label>Expires after<select value={duration} onChange={(event) => setDuration(event.target.value)} disabled={!session.authenticated || Boolean(storedFresh && stored?.registrationTx)}><option value="30">30 minutes</option><option value="60">1 hour</option><option value="360">6 hours</option><option value="1440">24 hours</option></select></label>
                <div className="scope-box"><div><span>Agent</span><code>{short(config?.agentAddress, 6)}</code></div><div><span>Merchant</span><code>{config?.merchant.name ?? "Not configured"}</code></div><div><span>Asset</span><code>{config?.asset.code ?? "—"}</code></div></div>
                {stored?.registrationTx && !stored.allowanceTx ? (
                  <button className="primary-button" onClick={retryAllowance} disabled={phase === "approving"}><RefreshCw size={16} /> {phase === "approving" ? "Waiting for Freighter…" : "Finish allowance approval"}</button>
                ) : (
                  <button className={`primary-button ${mandateBusy ? "busy" : ""}`} onClick={activate} disabled={!session.authenticated || !config?.ready || mandateBusy}>
                    {mandateBusy ? <LoaderCircle className="activation-spinner" size={17} /> : <Zap size={16} />}
                    {phase === "registering" ? "Securing your mandate…" : phase === "approving" ? "Finalizing your allowance…" : "Sign & activate mandate"}
                  </button>
                )}
                {mandateBusy && (
                  <div className="activation-progress" role="status" aria-live="polite">
                    <span className="activation-orbit" aria-hidden><i /><i /><i /></span>
                    <span><strong>Preparing Mainnet approval</strong><small>Keep this window open. Freighter appears when the transaction is ready.</small></span>
                  </div>
                )}
                <p className="fine-print"><ShieldCheck size={12} /> Allowance is granted only to MandateRegistry—not the agent or this app.</p>
              </>
            ) : (
              <div className="mandate-active">
                <div className="active-banner"><span><Check size={15} /></span><div><small>On-chain status</small><strong>Active mandate</strong></div></div>
                <div className="mandate-id"><span>Mandate ID</span><code>{short(currentMandate.id, 9)}</code></div>
                <button className="danger-button" onClick={revoke} disabled={phase === "revoking"}><X size={15} /> {phase === "revoking" ? "Waiting for Freighter…" : "Revoke authority"}</button>
              </div>
            )}
          </div>
        </aside>

        <section className="panel glass chat-panel">
          <div className="chat-head">
            <div className="agent-title"><div className="agent-orb"><Bot size={21} /></div><div><p className="eyebrow">03 · CONSUMER AGENT</p><h2>Research console</h2></div></div>
            <div className={`agent-status ${mandateOnline ? "online" : ""}`}><span /> {mandateOnline ? "MANDATE ONLINE" : "AWAITING MANDATE"}</div>
          </div>
          {mandateOnline && mandate && config ? (
            <AssistantThread mandateId={mandate.id} asset={config.asset.code} explorerNetwork={config.explorerNetwork} />
          ) : (
            <div className="chat-locked">
              <div className="lock-rings"><LockKeyhole size={27} /></div>
              <p className="eyebrow">AGENT LOCKED</p>
              <h3>Authority comes first.</h3>
              <p>Connect Freighter, register the mandate, and approve the contract allowance. Chat unlocks only after the on-chain state reads Active.</p>
            </div>
          )}
        </section>

        <aside className="evidence-column">
          <div className="panel glass authority-card">
            <div className="panel-heading"><div><p className="eyebrow">LIVE AUTHORITY</p><h2>Spending envelope</h2></div><CircleDollarSign size={20} /></div>
            <div className="remaining"><span>Remaining</span><strong>{remaining} <small>{config?.asset.code ?? ""}</small></strong></div>
            <div className="meter"><span style={{ width: `${Math.min(100, usedPercent)}%` }} /></div>
            <div className="budget-row"><div><span>Spent</span><strong>{spent}</strong></div><div><span>Budget</span><strong>{currentMandate && config ? formatUnits(currentMandate.maxAmount, config.asset.decimals) : budget}</strong></div></div>
            <div className="authority-list">
              <div><Clock3 size={14} /><span>Expires</span><strong>{expires ? new Date(expires * 1_000).toLocaleString() : "Not signed"}</strong></div>
              <div><Fingerprint size={14} /><span>Sequence</span><strong>{currentMandate?.seq ?? 0}</strong></div>
              <div><Database size={14} /><span>State</span><strong>{config?.durableState ? "Durable" : "Local preview"}</strong></div>
            </div>
          </div>

          <div className="panel glass proof-card">
            <div className="panel-heading"><div><p className="eyebrow">CHAIN EVIDENCE</p><h2>Verifiable by default</h2></div><ExternalLink size={18} /></div>
            <a href={config?.mandateRegistryId ? `${explorer}/contract/${config.mandateRegistryId}` : "#"} target="_blank" rel="noreferrer"><span>MandateRegistry</span><code>{short(config?.mandateRegistryId, 6)}</code><ArrowUpRight size={14} /></a>
            {stored?.registrationTx && <TransactionEvidence label="Registration" hash={stored.registrationTx} explorer={explorer} />}
            {stored?.allowanceTx && <TransactionEvidence label="Allowance" hash={stored.allowanceTx} explorer={explorer} />}
            {stored?.revokeTx && <TransactionEvidence label="Revocation" hash={stored.revokeTx} explorer={explorer} />}
          </div>

          {config && !config.ready && (
            <div className="panel gate-card"><TriangleAlert size={18} /><div><strong>Release gate closed</strong><p>{config.blockers.length} configuration item{config.blockers.length === 1 ? "" : "s"} remain. No mainnet fallback is permitted.</p></div></div>
          )}
        </aside>
      </section>

      {(notice || error) && <div className={`toast ${error ? "error" : ""}`}><span>{error ? <TriangleAlert size={16} /> : <Check size={16} />}</span><p>{error ?? notice}</p><button onClick={() => { setError(null); setNotice(null); }} aria-label="Dismiss"><X size={14} /></button></div>}

      <footer className="footer shell"><div><ShieldCheck size={15} /> Protocol-enforced spending limits</div><p>SDK, model, and interface are untrusted. MandateRegistry decides whether value moves.</p><Link href="/wallet/diagnostics">Release diagnostics <ArrowUpRight size={13} /></Link></footer>
    </main>
  );
}
