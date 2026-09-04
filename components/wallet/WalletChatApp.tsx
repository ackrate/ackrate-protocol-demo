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
import { AssistantThread, PurchaseReport, type PurchaseResult } from "./AssistantThread";

type Phase = "idle" | "authenticating" | "adding-asset" | "registering" | "approving" | "active" | "revoking";

interface StoredMandate {
  schemaVersion: 2;
  id: string;
  credentialHash: string;
  registryId: string;
  releaseFingerprint: string | null;
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

function mandateStorageKey(config: SafeAppConfig, address: string): string {
  return `ackrate:mandate:v2:${config.network}:${config.mandateRegistryId}:${address}`;
}

function legacyMandateStorageKey(config: SafeAppConfig, address: string): string {
  return `ackrate:mandate:${config.network}:${address}`;
}

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
  const [budget, setBudget] = useState("0.10");
  const [duration, setDuration] = useState("60");
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [usdcReady, setUsdcReady] = useState(false);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1_000));
  const [completedPurchase, setCompletedPurchase] = useState<PurchaseResult | null>(null);

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
    const key = mandateStorageKey(config, session.address);
    localStorage.removeItem(legacyMandateStorageKey(config, session.address));
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as StoredMandate;
      if (
        parsed.schemaVersion !== 2
        || parsed.user !== session.address
        || parsed.registryId !== config.mandateRegistryId
        || parsed.releaseFingerprint !== config.releaseFingerprint
        || !/^[0-9a-f]{64}$/.test(parsed.id)
        || !/^[0-9a-f]{64}$/.test(parsed.credentialHash)
      ) throw new Error("invalid stored mandate");
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
    localStorage.setItem(mandateStorageKey(config, value.user), JSON.stringify(value));
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
      setNotice("Wallet connected. No transaction was created, signed, or sent.");
      setPhase("idle");
    } catch (cause) {
      setError("Could not connect. Open Freighter, choose Mainnet, and try again.");
      setNotice(null);
      setPhase("idle");
    }
  };

  const authenticate = async () => {
    if (!config || !walletAddress) return;
    setError(null);
    if (walletAddress === config.contractAuthorityAddress) {
      setError("This is the contract's 2-of-3 governance account. Use a separate personal Mainnet wallet here.");
      setNotice("The V2 contract stays protected by multisig; the consumer wallet signs only its own spending limit.");
      setPhase("idle");
      return;
    }
    setPhase("authenticating");
    try {
      const challenge = await api<{ transactionXdr: string }>("/api/wallet/auth/challenge", {
        method: "POST",
        body: JSON.stringify({ address: walletAddress }),
      });
      setNotice("Verify wallet control in Freighter. This challenge is never sent to Mainnet.");
      const signedTransactionXdr = await signFreighterTransaction(
        challenge.transactionXdr,
        walletAddress,
        config.networkPassphrase,
      );
      const verified = await api<{ session: SessionView }>("/api/wallet/auth/verify", {
        method: "POST",
        body: JSON.stringify({ signedTransactionXdr }),
      });
      setSession(verified.session);
      setNotice("Wallet verified. You can now choose a spending limit.");
      setPhase("idle");
    } catch (cause) {
      setError("Could not verify this wallet. No transaction was sent to Mainnet.");
      setNotice(null);
      setPhase("idle");
    }
  };

  const activate = async () => {
    if (!config || !session.address || !config.ready) return;
    setError(null);
    setCompletedPurchase(null);
    if (session.address === config.contractAuthorityAddress) {
      setError("This is the contract's 2-of-3 governance account. It cannot finish consumer setup in one Freighter window.");
      setNotice("Disconnect it and connect a separate personal Mainnet wallet. The V2 contract stays protected by 2-of-3.");
      setPhase("idle");
      return;
    }
    try {
      const expiry = Math.floor(Date.now() / 1_000) + Number(duration) * 60;
      const intent = buildMandate(config, session.address, { budget, expiry });
      let next: StoredMandate = {
        schemaVersion: 2,
        id: intent.id,
        credentialHash: intent.id,
        registryId: config.mandateRegistryId,
        releaseFingerprint: config.releaseFingerprint,
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
      const registration = await registerWithFreighter(config, intent, (mandateId) => {
        next = { ...next, id: mandateId };
        saveStored(next);
      });
      next = { ...next, id: registration.mandateId, registrationTx: registration.transactionHash };
      saveStored(next);
      setPhase("approving");
      setNotice("One more Freighter approval lets Ackrate use USDC within your limit.");
      const allowanceTx = await approveWithFreighter(config, storedToIntent(next));
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
      setUsdcReady(true);
      setNotice("USDC is ready in Freighter.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (/already.*trustline|trustline.*already/i.test(message)) {
        setUsdcReady(true);
        setError(null);
        setNotice("USDC is already ready in your wallet.");
      } else {
        setError("Could not add USDC. Open Freighter and try again.");
        setNotice(null);
      }
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
      localStorage.removeItem(mandateStorageKey(config, session.address));
      localStorage.removeItem(legacyMandateStorageKey(config, session.address));
    }
    localStorage.removeItem("ackrate:mainnet:last-payment");
    setSession(emptySession);
    setWalletAddress(null);
    setMandate(null);
    setStored(null);
    setUsdcReady(false);
    setCompletedPurchase(null);
    setPhase("idle");
    setDisconnectOpen(false);
    setNotice("Wallet disconnected. Connect a wallet to start again.");
  };

  const mandateOnline = Boolean(mandate?.status === "Active" && mandate.expiry > nowSeconds);
  const spendingOff = Boolean(stored?.revokeTx && mandate?.status !== "Active");
  const storedFresh = Boolean(stored && stored.expiry > nowSeconds);
  const currentMandate = mandateOnline ? mandate : null;
  const progress = mandateOnline ? 3 : storedFresh && stored?.registrationTx ? 2 : walletAddress ? 1 : 0;
  const remaining = currentMandate && config ? formatUnits(currentMandate.remaining, config.asset.decimals) : budget;
  const spent = currentMandate && config ? formatUnits(currentMandate.spent, config.asset.decimals) : "0";
  const usedPercent = currentMandate && BigInt(currentMandate.maxAmount) > 0n
    ? Number((BigInt(currentMandate.spent) * 10_000n) / BigInt(currentMandate.maxAmount)) / 100
    : 0;
  const expires = currentMandate?.expiry ?? (storedFresh ? stored?.expiry : undefined);
  const explorer = config ? `https://stellar.expert/explorer/${config.explorerNetwork}` : "#";
  const mandateBusy = phase === "registering" || phase === "approving";
  const governanceWalletConnected = Boolean(
    config?.contractAuthorityAddress && walletAddress === config.contractAuthorityAddress,
  );

  const showLegacyWorkflow: boolean = false;
  if (showLegacyWorkflow) {
    return (
      <main className="wallet-preview app-frame">
        <div className="aurora" aria-hidden />
        <header className="topbar">
          <Link href="/" className="brand"><span>R</span> ACKRATE</Link>
          <div className="topbar-center"><span className="pulse-dot" /> Wallet & payments</div>
          <div className="topbar-actions">
            <Link href="/wallet/diagnostics" className="nav-link">Diagnostics</Link>
            {walletAddress ? (
              <button className="wallet-pill" onClick={session.authenticated ? () => setDisconnectOpen(true) : disconnect} title="Disconnect wallet"><Power size={13} /> Disconnect wallet</button>
            ) : (
              <button className="wallet-pill" onClick={connect} disabled={!config || phase === "authenticating"}><WalletCards size={14} /> Connect wallet</button>
            )}
          </div>
        </header>

        <section className="hero shell">
          <div>
            <div className="status-chip"><Sparkles size={13} /> {config?.network === "mainnet" ? "MAINNET V2 · MULTISIG-GOVERNED CONTRACT" : "BOUNDED AGENT PAYMENTS"}</div>
            <h1>Choose what the agent can spend.<br /><span>Stay in control.</span></h1>
            <p>You choose the limit. Ackrate checks it before every payment.</p>
          </div>
          <div className="network-card glass">
            <div className="network-card-top">
              <span><Activity size={14} /> PAYMENT NETWORK</span>
              <b className={config?.ready ? "online" : "blocked"}>{config?.ready ? "READY" : "NOT READY"}</b>
            </div>
            <strong>{config?.networkLabel ?? "Loading network…"}</strong>
            <a
              className="network-contract-link"
              href={config?.mandateRegistryId ? `${explorer}/contract/${config.mandateRegistryId}` : "#"}
              target="_blank"
              rel="noreferrer"
            >
              <code>{short(config?.mandateRegistryId, 9)}</code><ArrowUpRight size={12} />
            </a>
            <div className="network-meta"><ShieldCheck size={14} /> V2 contract · {config?.asset.code ?? "Asset"} · $0.01 per purchase</div>
          </div>
        </section>

        <section className="steps shell" aria-label="Activation progress">
          {[
            [1, "Wallet", session.authenticated ? "Verified" : walletAddress ? "Connected — verify next" : "Connect — no transaction"],
            [2, "Spending", mandateOnline ? "Limit is on" : spendingOff ? "Turned off" : session.authenticated ? "Choose a limit" : "Not started"],
            [3, "Buy", mandateOnline ? "Ready" : "Not ready"],
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
              <div className="panel-heading"><div><p className="eyebrow">01 · WALLET</p><h2>Your wallet</h2></div><div className={`icon-tile ${walletAddress ? "live" : ""}`}><WalletCards size={19} /></div></div>
              {session.authenticated ? (
                <div className="connected-state">
                  <div className="identity-line"><span className="wallet-led" /><div><small>Connected wallet</small><code>{short(session.address, 9)}</code></div><ShieldCheck size={18} /></div>
                  <p><LockKeyhole size={13} /> Your wallet is connected.</p>
                  <button className="disconnect-button" onClick={() => setDisconnectOpen(true)}>
                    <Power size={15} /> Disconnect wallet
                  </button>
                  {mandateOnline && <p className="disconnect-help">Tap Disconnect wallet. Ackrate will guide you through both steps.</p>}
                  {config?.network === "mainnet" && (
                    <button className="secondary-button" onClick={addUsdc} disabled={phase === "adding-asset" || usdcReady}>
                      <CircleDollarSign size={15} /> {phase === "adding-asset" ? "Waiting for Freighter…" : usdcReady ? "USDC is ready" : "Add USDC to wallet"}
                    </button>
                  )}
                </div>
              ) : walletAddress ? (
                <div className="connected-state">
                  <div className="identity-line"><span className="wallet-led" /><div><small>Connected wallet</small><code>{short(walletAddress, 9)}</code></div><WalletCards size={18} /></div>
                  {governanceWalletConnected ? (
                    <div className="governance-warning" role="alert">
                      <TriangleAlert size={16} />
                      <div><strong>Contract account detected</strong><p>This 2-of-3 account protects the contract. Connect a separate personal Mainnet wallet to buy research.</p></div>
                    </div>
                  ) : (
                    <>
                      <p><ShieldCheck size={13} /> Connection is read-only. No Mainnet transaction was created, signed, or sent.</p>
                      <button className="primary-button" onClick={authenticate} disabled={phase === "authenticating"}>
                        <LockKeyhole size={16} /> {phase === "authenticating" ? "Waiting for Freighter…" : "Verify wallet — no broadcast"}
                      </button>
                    </>
                  )}
                  <button className="disconnect-button" onClick={disconnect} disabled={phase === "authenticating"}>
                    <Power size={15} /> {governanceWalletConnected ? "Use a personal wallet" : "Disconnect wallet"}
                  </button>
                </div>
              ) : (
                <>
                  <p className="panel-copy">Connect your Freighter wallet to display its public address. Connecting does not create, sign, or send a Mainnet transaction.</p>
                  <button className="primary-button" onClick={connect} disabled={!config || phase === "authenticating"}><WalletCards size={16} /> {phase === "authenticating" ? "Waiting for Freighter…" : "Connect wallet"}</button>
                </>
              )}
            </div>

            <div className={`panel glass mandate-panel ${!session.authenticated ? "muted" : ""}`}>
              <div className="panel-heading"><div><p className="eyebrow">02 · SPENDING</p><h2>Set a spending limit</h2></div><div className={`icon-tile ${mandateOnline ? "live" : ""}`}><Fingerprint size={19} /></div></div>
              {spendingOff ? (
                <div className="mandate-active">
                  <div className="active-banner mandate-off"><span><Check size={15} /></span><div><small>Status</small><strong>Spending is off</strong></div></div>
                  <p className="shutdown-copy">The agent cannot spend now.</p>
                  <TransactionEvidence label="Spending turned off" hash={stored!.revokeTx!} explorer={explorer} />
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
                    <button className={`primary-button ${mandateBusy ? "busy" : ""}`} onClick={activate} disabled={!session.authenticated || !config?.ready || mandateBusy || governanceWalletConnected}>
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
              <AssistantThread mandateId={mandate.id} asset={config.asset.code} explorerNetwork={config.explorerNetwork} onPurchaseComplete={setCompletedPurchase} />
            ) : (
              <div className="chat-locked">
                <div className="lock-rings"><LockKeyhole size={27} /></div>
                <p className="eyebrow">{spendingOff ? "SPENDING IS OFF" : session.authenticated ? "SET YOUR LIMIT" : "NOT READY"}</p>
                <h3>{spendingOff ? "Finish by disconnecting." : session.authenticated ? "Your wallet is connected." : "Connect your wallet first."}</h3>
                <p>{spendingOff ? "Disconnect your wallet to clear this setup and start fresh." : session.authenticated ? "Choose and approve a spending limit on the left. Then you can buy." : "Connect your wallet and approve a spending limit. Then you can buy."}</p>
                {spendingOff && (
                  <button className="disconnect-button locked-action" onClick={() => setDisconnectOpen(true)}>
                    <Power size={16} /> Disconnect wallet
                  </button>
                )}
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

        {completedPurchase && config && (
          <PurchaseReport
            result={completedPurchase}
            explorerNetwork={config.explorerNetwork}
            registryId={config.mandateRegistryId}
            registrationTx={stored?.registrationTx}
            allowanceTx={stored?.allowanceTx}
          />
        )}

        {disconnectOpen && session.authenticated && (
          <div className="disconnect-overlay" role="presentation">
            <section className="disconnect-dialog glass" role="dialog" aria-modal="true" aria-labelledby="disconnect-title">
              <button className="disconnect-close" type="button" onClick={() => setDisconnectOpen(false)} aria-label="Close"><X size={18} /></button>
              <div className="disconnect-icon"><Power size={22} /></div>
              <p className="eyebrow">DISCONNECT WALLET</p>
              {mandateOnline ? (
                <>
                  <h2 id="disconnect-title">First, turn off spending</h2>
                  <p>This stops the agent from spending. Freighter will ask you to approve.</p>
                  <button className="danger-button" onClick={revoke} disabled={phase === "revoking"}>
                    <X size={16} /> {phase === "revoking" ? "Waiting for Freighter…" : "Turn off spending"}
                  </button>
                  {error && <p className="disconnect-error">{error}</p>}
                </>
              ) : (
                <>
                  <h2 id="disconnect-title">Ready to disconnect</h2>
                  <p>Your saved setup will be cleared. Connecting again will start fresh.</p>
                  {stored?.revokeTx && <TransactionEvidence label="Spending turned off" hash={stored.revokeTx} explorer={explorer} />}
                  <button className="disconnect-button" onClick={disconnect}><Power size={16} /> Disconnect wallet</button>
                  {error && <p className="disconnect-error">{error}</p>}
                </>
              )}
            </section>
          </div>
        )}

        {(notice || error) && <div className={`toast ${error ? "error" : ""}`}><span>{error ? <TriangleAlert size={16} /> : <Check size={16} />}</span><p>{error ?? notice}</p><button onClick={() => { setError(null); setNotice(null); }} aria-label="Dismiss"><X size={14} /></button></div>}

        <footer className="footer shell"><div><ShieldCheck size={15} /> Your spending limit is checked every time</div><p>Ackrate decides if a payment is allowed.</p><Link href="/wallet/diagnostics">Technical details <ArrowUpRight size={13} /></Link></footer>
      </main>
    );
  }

  const connected = session.authenticated && Boolean(session.address);
  const stepOneExplorer = config ? `https://stellar.expert/explorer/${config.explorerNetwork}` : "#";

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
              <button className="flow-primary" type="button" onClick={walletAddress ? authenticate : connect} disabled={!config || phase === "authenticating"}>
                {phase === "authenticating" ? <LoaderCircle className="spin" size={17} /> : <WalletCards size={17} />}
                {phase === "authenticating" ? "Waiting for Freighter…" : walletAddress ? "Verify wallet" : "Connect Freighter"}
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
          <a href={config?.mandateRegistryId ? `${stepOneExplorer}/contract/${config.mandateRegistryId}` : "#"} target="_blank" rel="noreferrer">View contract <ArrowUpRight size={13} /></a>
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
