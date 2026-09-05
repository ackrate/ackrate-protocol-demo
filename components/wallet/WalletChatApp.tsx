"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
  Globe2,
  LockKeyhole,
  LoaderCircle,
  Power,
  RefreshCw,
  Search,
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
import { sourceIdForMarketplaceService, WEB_SEARCH_INPUTS, type MarketplaceService } from "@/lib/wallet/marketplace-catalog";
import { AssistantThread, PurchaseReport, type PurchaseResult } from "./AssistantThread";
import { MarketplaceOrb } from "./MarketplaceOrb";
import { ProtocolWorld } from "./ProtocolWorld";
import { initialServiceInputValues, ServiceConfigurator, type ServiceInputValues } from "./ServiceConfigurator";

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

interface WalletBalances {
  address: string;
  xlm: string;
  usdc: string;
  xlmRaw: string;
  usdcRaw: string;
  hasUsdcTrustline: boolean;
}

const emptySession: SessionView = { authenticated: false, address: null, network: null, expiresAt: null };
const MARKETPLACE_URL = "https://agent402.tools/stellar";
const MARKETPLACE_SERVICE_ID = "agent402:web-search";
const DEFAULT_MARKETPLACE_SERVICE: MarketplaceService = {
  id: "search",
  name: "Web search",
  description: "Find ranked, current web results with titles, links, snippets, and freshness metadata.",
  category: "web",
  categoryLabel: "Web & documents",
  method: "GET",
  path: "/api/search",
  price: "0.02",
  docs: "https://agent402.tools/tools/search",
  inputs: WEB_SEARCH_INPUTS,
  schemaSource: "verified-docs",
};

function marketplaceStorageKey(address: string): string {
  return `ackrate:marketplace:${address}`;
}

function storedMarketplaceService(value: unknown): MarketplaceService | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const service = value as Record<string, unknown>;
  if (
    typeof service.id !== "string"
    || typeof service.name !== "string"
    || typeof service.description !== "string"
    || typeof service.category !== "string"
    || typeof service.categoryLabel !== "string"
    || (service.method !== "GET" && service.method !== "POST")
    || typeof service.path !== "string"
    || typeof service.price !== "string"
    || typeof service.docs !== "string"
  ) return null;
  const inputs = Array.isArray(service.inputs) ? service.inputs : [];
  const restored = { ...service, inputs } as unknown as MarketplaceService;
  return isGuidedResearchService(restored)
    ? { ...restored, inputs: inputs.length ? inputs : WEB_SEARCH_INPUTS, schemaSource: inputs.length ? restored.schemaSource : "verified-docs" }
    : restored;
}

function isGuidedResearchService(service: MarketplaceService): boolean {
  return service.id === "search"
    && service.method === "GET"
    && service.path === "/api/search"
    && service.price === "0.02";
}

function isRunnableMarketplaceService(service: MarketplaceService): boolean {
  return sourceIdForMarketplaceService(service) !== null && service.inputs.length > 0;
}

function marketplaceSettlement(result: PurchaseResult): { transaction: string; amount: string } | null {
  if (typeof result.delivered !== "object" || result.delivered === null) return null;
  const marketplace = (result.delivered as { marketplace?: unknown }).marketplace;
  if (typeof marketplace !== "object" || marketplace === null) return null;
  const settlement = (marketplace as { settlement?: unknown }).settlement;
  if (typeof settlement !== "object" || settlement === null) return null;
  const transaction = (settlement as { transaction?: unknown }).transaction;
  const amount = (settlement as { amount?: unknown }).amount;
  return typeof transaction === "string" && /^[0-9a-f]{64}$/i.test(transaction) && typeof amount === "string"
    ? { transaction, amount }
    : null;
}

function allowanceFailureMessage(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  if (/declin|reject|cancel|closed/i.test(detail) && /freighter|sign/i.test(detail)) {
    return "Nothing was sent. Click the button again, then confirm the one USDC approval in Freighter.";
  }
  if (/too late|expired|time.?bound/i.test(detail)) {
    return "The approval window expired before submission. Click the button again; the new window lasts ten minutes.";
  }
  if (/different signer|different account/i.test(detail)) {
    return "Freighter changed accounts. Select the same burner wallet, then click the approval button again.";
  }
  if (/network stayed busy|TRY_AGAIN_LATER|NOT_FOUND|transport|timeout|fetch/i.test(detail)) {
    return "Stellar did not accept the approval yet. Your funds are safe—wait a few seconds, then click the button once more.";
  }
  return "The USDC approval did not finish. Your registered limit is safe; click the button and approve the one Freighter transaction again.";
}

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
  const reduceMotion = useReducedMotion();
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
  const [walletBalances, setWalletBalances] = useState<WalletBalances | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1_000));
  const [completedPurchase, setCompletedPurchase] = useState<PurchaseResult | null>(null);
  const [marketplaceSelected, setMarketplaceSelected] = useState(false);
  const [serviceConfigured, setServiceConfigured] = useState(false);
  const [marketplaceService, setMarketplaceService] = useState<MarketplaceService>(DEFAULT_MARKETPLACE_SERVICE);
  const [serviceInputValues, setServiceInputValues] = useState<ServiceInputValues>(() => initialServiceInputValues(DEFAULT_MARKETPLACE_SERVICE));
  const [marketplaceDraft, setMarketplaceDraft] = useState<MarketplaceService>(DEFAULT_MARKETPLACE_SERVICE);
  const [marketplaceQuery, setMarketplaceQuery] = useState("");
  const [marketplaceServices, setMarketplaceServices] = useState<MarketplaceService[]>([DEFAULT_MARKETPLACE_SERVICE]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [marketplaceCatalog, setMarketplaceCatalog] = useState({ source: "loading", size: 0, matches: 0 });

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

  const refreshWalletBalances = useCallback(async () => {
    if (!session.authenticated || !session.address || config?.network !== "mainnet") return;
    setBalancesLoading(true);
    try {
      const result = await api<{ balances: WalletBalances }>(`/api/wallet/balances?address=${encodeURIComponent(session.address)}`);
      setWalletBalances(result.balances);
      setUsdcReady(result.balances.hasUsdcTrustline);
    } catch (cause) {
      setWalletBalances(null);
      setError(cause instanceof Error ? cause.message : "Could not read wallet balances");
    } finally {
      setBalancesLoading(false);
    }
  }, [config?.network, session.address, session.authenticated]);

  useEffect(() => {
    if (!session.authenticated || !session.address) {
      setWalletBalances(null);
      return;
    }
    void refreshWalletBalances();
  }, [refreshWalletBalances, session.address, session.authenticated]);

  useEffect(() => {
    const refresh = () => { if (stored) void refreshMandate(stored); };
    window.addEventListener("ackrate-mandate-updated", refresh);
    return () => window.removeEventListener("ackrate-mandate-updated", refresh);
  }, [refreshMandate, stored]);

  useEffect(() => {
    if (!session.authenticated || !session.address) {
      setMarketplaceSelected(false);
      setServiceConfigured(false);
      return;
    }
    const raw = localStorage.getItem(marketplaceStorageKey(session.address));
    if (raw === MARKETPLACE_SERVICE_ID) {
      setMarketplaceService(DEFAULT_MARKETPLACE_SERVICE);
      setMarketplaceDraft(DEFAULT_MARKETPLACE_SERVICE);
      setServiceInputValues(initialServiceInputValues(DEFAULT_MARKETPLACE_SERVICE));
      setMarketplaceSelected(true);
      setServiceConfigured(false);
      return;
    }
    try {
      const restored = storedMarketplaceService(JSON.parse(raw ?? "null"));
      if (!restored) throw new Error("invalid marketplace service");
      setMarketplaceService(restored);
      setMarketplaceDraft(restored);
      setServiceInputValues(initialServiceInputValues(restored));
      setMarketplaceSelected(true);
      setServiceConfigured(false);
    } catch {
      localStorage.removeItem(marketplaceStorageKey(session.address));
      setMarketplaceService(DEFAULT_MARKETPLACE_SERVICE);
      setMarketplaceDraft(DEFAULT_MARKETPLACE_SERVICE);
      setServiceInputValues(initialServiceInputValues(DEFAULT_MARKETPLACE_SERVICE));
      setMarketplaceSelected(false);
      setServiceConfigured(false);
    }
  }, [session.address, session.authenticated]);

  useEffect(() => {
    if (!session.authenticated || !session.address || marketplaceSelected) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setMarketplaceLoading(true);
      void api<{
        source: "live" | "verified-fallback";
        catalogSize: number;
        totalMatches: number;
        services: MarketplaceService[];
      }>(`/api/wallet/marketplace/services?q=${encodeURIComponent(marketplaceQuery)}`, {
        signal: controller.signal,
      }).then((result) => {
        setMarketplaceServices(result.services);
        setMarketplaceCatalog({ source: result.source, size: result.catalogSize, matches: result.totalMatches });
      }).catch((cause) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Could not load marketplace services");
      }).finally(() => {
        if (!controller.signal.aborted) setMarketplaceLoading(false);
      });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [marketplaceQuery, marketplaceSelected, session.address, session.authenticated]);

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
      setNotice("Wallet verified. You can now choose a marketplace service.");
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
      await refreshMandate(next);
      setPhase("idle");
      setNotice("Limit registered. Click the approval button once more to approve the USDC allowance.");
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
      await refreshWalletBalances();
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
      console.error("USDC allowance approval failed", cause);
      setError(allowanceFailureMessage(cause));
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
    setWalletBalances(null);
    setCompletedPurchase(null);
    setMarketplaceSelected(false);
    setServiceConfigured(false);
    setMarketplaceService(DEFAULT_MARKETPLACE_SERVICE);
    setMarketplaceDraft(DEFAULT_MARKETPLACE_SERVICE);
    setServiceInputValues(initialServiceInputValues(DEFAULT_MARKETPLACE_SERVICE));
    setMarketplaceQuery("");
    setPhase("idle");
    setDisconnectOpen(false);
    setNotice("Wallet disconnected. Connect a wallet to start again.");
  };

  const chooseMarketplaceService = () => {
    if (!session.address) return;
    localStorage.setItem(marketplaceStorageKey(session.address), JSON.stringify(marketplaceDraft));
    setMarketplaceService(marketplaceDraft);
    setServiceInputValues(initialServiceInputValues(marketplaceDraft));
    setMarketplaceSelected(true);
    setServiceConfigured(false);
    setError(null);
    setNotice(`${marketplaceDraft.name} selected. Configure its published inputs next.`);
  };

  const changeMarketplaceService = () => {
    setMarketplaceDraft(marketplaceService);
    setMarketplaceQuery("");
    setMarketplaceSelected(false);
    setServiceConfigured(false);
    setError(null);
    setNotice(null);
  };

  const mandateOnline = Boolean(mandate?.status === "Active" && mandate.expiry > nowSeconds);
  const mandateMatchesConfig = Boolean(
    stored
    && config
    && stored.agent === config.agentAddress
    && stored.merchant === config.merchant.address
    && stored.asset === config.asset.contractId,
  );
  const spendingOff = Boolean(stored?.revokeTx && mandate?.status !== "Active");
  const storedFresh = Boolean(stored && stored.expiry > nowSeconds);
  const activeMandateReady = Boolean(mandateOnline && mandateMatchesConfig && storedFresh && stored?.allowanceTx);
  const currentMandate = mandateOnline ? mandate : null;
  const progress = activeMandateReady ? 3 : storedFresh && stored?.registrationTx ? 2 : walletAddress ? 1 : 0;
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
  const workflowStep = !connected ? 1 : !marketplaceSelected ? 2 : !serviceConfigured ? 3 : !activeMandateReady ? 4 : !completedPurchase ? 5 : 6;
  const budgetNumber = Number(budget);
  const minimumBudget = Number(marketplaceService.price);
  const budgetValid = Number.isFinite(budgetNumber) && budgetNumber >= minimumBudget && budgetNumber > 0;
  const hasEnoughUsdc = Boolean(walletBalances && Number(walletBalances.usdcRaw) >= budgetNumber);
  const canApproveLimit = Boolean(config?.ready && !mandateOnline && budgetValid && walletBalances?.hasUsdcTrustline && hasEnoughUsdc);
  const externalSettlement = completedPurchase ? marketplaceSettlement(completedPurchase) : null;
  const navState = (step: number) => workflowStep > step ? "done" : workflowStep === step ? "current" : "";

  return (
    <main className={`wallet-preview wallet-flow spatial-step-${workflowStep}`}>
      <ProtocolWorld step={workflowStep} reducedMotion={Boolean(reduceMotion)} />
      <header className="flow-header">
        <Link href="/" className="flow-brand"><span className="flow-brand-mark"><MarketplaceOrb variant="brand" /></span><strong>ACKRATE</strong></Link>
        <div className="flow-network"><span />{config?.networkLabel ?? "Loading Mainnet"}</div>
        <Link className="flow-text-button" href="/wallet/diagnostics">Verification <ArrowUpRight size={13} /></Link>
      </header>

      <section className={`flow-shell ${connected ? "flow-shell-active" : ""}`}>
        <motion.div
          className="flow-intro"
          initial={reduceMotion ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.42, ease: "easeOut" }}
        >
          <p>THE ENFORCEMENT LAYER FOR AGENT COMMERCE</p>
          <h1>Let agents spend.<br />Never lose control.</h1>
          <span>Explore real x402 services. Set the mandate once. Every USDC payment is enforced on-chain.</span>
        </motion.div>

        <motion.nav
          className="flow-progress"
          aria-label="Workflow progress"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.38, delay: reduceMotion ? 0 : 0.08, ease: "easeOut" }}
        >
          <div className={navState(1)}><span>{workflowStep > 1 ? <Check size={14} /> : 1}</span><strong>Connect</strong><small>IDENTITY</small></div>
          <div className={navState(2)}><span>{workflowStep > 2 ? <Check size={14} /> : 2}</span><strong>Marketplace</strong><small>DISCOVER</small></div>
          <div className={navState(3)}><span>{workflowStep > 3 ? <Check size={14} /> : 3}</span><strong>Configure</strong><small>PAYLOAD</small></div>
          <div className={navState(4)}><span>{workflowStep > 4 ? <Check size={14} /> : 4}</span><strong>Limit</strong><small>BOUNDARY</small></div>
          <div className={navState(5)}><span>{workflowStep > 5 ? <Check size={14} /> : 5}</span><strong>Run</strong><small>EXECUTE</small></div>
          <div className={navState(6)}><span>6</span><strong>Proof</strong><small>VERIFY</small></div>
        </motion.nav>

        <section className="flow-card">
          <AnimatePresence mode="wait" initial={!reduceMotion}>
          {!connected ? (
            <motion.div
              key="connect"
              className="flow-stage connect-stage"
              initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeOut" }}
            >
              <p className="flow-kicker">STEP 1 OF 6</p>
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
              <motion.button
                className="flow-primary"
                type="button"
                onClick={walletAddress ? authenticate : connect}
                disabled={!config || phase === "authenticating"}
                whileHover={reduceMotion || !config || phase === "authenticating" ? undefined : { y: -2, scale: 1.005 }}
                whileTap={reduceMotion || !config || phase === "authenticating" ? undefined : { scale: 0.985 }}
              >
                {phase === "authenticating" ? <LoaderCircle className="spin" size={17} /> : <WalletCards size={17} />}
                {phase === "authenticating" ? "Waiting for Freighter…" : walletAddress ? "Verify wallet" : "Connect Freighter"}
              </motion.button>
              <small className="flow-footnote"><LockKeyhole size={12} />Freighter may show a connection prompt and a verification signature.</small>
            </motion.div>
          ) : !marketplaceSelected ? (
            <motion.div
              key="marketplace"
              className="flow-stage marketplace-stage"
              initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeOut" }}
            >
              <div className="flow-stage-heading">
                <div>
                  <p className="flow-kicker">STEP 2 OF 6</p>
                  <h2>Choose the research source</h2>
                  <p className="flow-description">Pick the external service the agent will use to gather current evidence.</p>
                </div>
                <span className="flow-wallet-chip"><WalletCards size={13} />{short(session.address, 5)}</span>
              </div>

              <div className="marketplace-source">
                <span className="marketplace-source-icon"><Globe2 size={18} /></span>
                <span><small>STELLAR x402 MARKETPLACE</small><strong>Agent402</strong></span>
                <a className="marketplace-source-link" href={MARKETPLACE_URL} target="_blank" rel="noreferrer">Open marketplace <ArrowUpRight size={13} /></a>
              </div>

              <label className="marketplace-search">
                <Search size={15} />
                <input
                  type="search"
                  value={marketplaceQuery}
                  onChange={(event) => setMarketplaceQuery(event.target.value)}
                  placeholder="Search web, research, scraper, PDF…"
                  maxLength={80}
                  aria-label="Search Agent402 services"
                />
                {marketplaceLoading && <LoaderCircle className="spin" size={14} />}
              </label>

              <div className="marketplace-suggestions" aria-label="Suggested marketplace searches">
                {["Web search", "Research", "Scraper", "PDF"].map((suggestion) => (
                  <button type="button" key={suggestion} onClick={() => setMarketplaceQuery(suggestion)}>{suggestion}</button>
                ))}
              </div>

              <div className="service-label">
                <span>{marketplaceQuery ? "MATCHING SERVICES" : "RECOMMENDED FOR RESEARCH"}</span>
                <small>{marketplaceCatalog.source === "live" ? `${marketplaceCatalog.size} live tools` : "verified catalog"}</small>
              </div>
              <div className="marketplace-results" aria-live="polite" aria-busy={marketplaceLoading}>
                {marketplaceServices.length ? marketplaceServices.map((service) => {
                  const selected = marketplaceDraft.id === service.id;
                  return (
                    <motion.button
                      className={`service-option ${selected ? "selected" : ""}`}
                      type="button"
                      key={service.id}
                      onClick={() => setMarketplaceDraft(service)}
                      aria-pressed={selected}
                      whileHover={reduceMotion ? undefined : { x: 3 }}
                      whileTap={reduceMotion ? undefined : { scale: 0.992 }}
                    >
                      <span className="service-radio">{selected ? <Check size={13} /> : <span />}</span>
                      <span>
                        <strong>{service.name}</strong>
                        <small>{service.description}</small>
                        <em>{service.method} · {service.categoryLabel} · {isRunnableMarketplaceService(service) ? "LIVE PAYMENT READY" : "SCHEMA PREVIEW"}</em>
                        <span className="service-inputs">{service.inputs.length ? service.inputs.map((field) => <b key={field.name}>{field.name}{field.required ? " *" : ""}</b>) : <b>Schema unavailable</b>}</span>
                      </span>
                      <span className="service-price">{service.price} <small>USDC</small></span>
                    </motion.button>
                  );
                }) : (
                  <div className="marketplace-empty"><Search size={17} /><strong>No exact match</strong><span>Try web, research, scraper, PDF, news, or data.</span></div>
                )}
              </div>

              <div className="service-facts" aria-label="Service details">
                <span><Check size={12} />Stellar Mainnet</span>
                <span><Check size={12} />x402 payment</span>
                <span><Check size={12} />No marketplace account</span>
                <span><Check size={12} />{marketplaceCatalog.matches || marketplaceServices.length} matches</span>
              </div>

              {!isRunnableMarketplaceService(marketplaceDraft) && (
                <div className="flow-alert"><TriangleAlert size={16} /><span><strong>{marketplaceDraft.name} is visible from the live catalog.</strong> Its schema can be inspected, but this release executes Web Search, PDF to Text, and PDF Info.</span></div>
              )}
              <motion.button
                className="flow-primary"
                type="button"
                onClick={chooseMarketplaceService}
                disabled={!isRunnableMarketplaceService(marketplaceDraft)}
                whileHover={reduceMotion ? undefined : { y: -1 }}
                whileTap={reduceMotion ? undefined : { scale: 0.985 }}
              >Configure {marketplaceDraft.name} <ChevronRight size={16} /></motion.button>
              <small className="flow-footnote"><LockKeyhole size={12} />Choosing a service does not move funds. Payment happens only when research runs.</small>
            </motion.div>
          ) : !serviceConfigured ? (
            <motion.div
              key="configure"
              className="flow-stage configure-stage"
              initial={reduceMotion ? false : { opacity: 0, rotateY: -4, x: 16 }}
              animate={{ opacity: 1, rotateY: 0, x: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, rotateY: 4, x: -16 }}
              transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flow-stage-heading">
                <div>
                  <p className="flow-kicker">STEP 3 OF 6</p>
                  <h2>{isGuidedResearchService(marketplaceService) ? "What do you want to know?" : `Configure ${marketplaceService.name}`}</h2>
                  <p className="flow-description">These fields come directly from the live Agent402 service schema.</p>
                </div>
                <span className="flow-wallet-chip"><Globe2 size={13} />LIVE SCHEMA</span>
              </div>
              <ServiceConfigurator
                service={marketplaceService}
                values={serviceInputValues}
                executable={isRunnableMarketplaceService(marketplaceService)}
                onChange={setServiceInputValues}
                onBack={changeMarketplaceService}
                onContinue={() => {
                  setServiceConfigured(true);
                  setNotice(`${marketplaceService.name} inputs locked. Set the agent's spending limit next.`);
                }}
              />
            </motion.div>
          ) : !activeMandateReady ? (
            <motion.div
              key="limit"
              className="flow-stage"
              initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeOut" }}
            >
              <div className="flow-stage-heading">
                <div><p className="flow-kicker">STEP 4 OF 6</p><h2>Set the spending limit</h2><p className="flow-description">Choose the maximum this agent may spend before the limit expires.</p></div>
                <span className="flow-wallet-chip"><WalletCards size={13} />{short(session.address, 5)}</span>
              </div>

              {mandateOnline && !mandateMatchesConfig && (
                <div className="flow-alert"><TriangleAlert size={16} /><span><strong>A previous spending limit is still active.</strong> Turn it off before creating the Agent402 limit. This prevents an old payment scope from being mistaken for the new one.</span></div>
              )}

              <div className="selected-service-summary">
                <span className="marketplace-source-icon"><Globe2 size={17} /></span>
                <span><small>REAL x402 SERVICE</small><strong>Agent402 · {marketplaceService.name}</strong><em>{marketplaceService.method} · {marketplaceService.path}</em></span>
                <span className="service-price">{marketplaceService.price} <small>USDC / REPORT</small></span>
              </div>

              <div className="flow-balance-grid">
                <div><small>WALLET USDC</small><strong>{balancesLoading ? "Reading…" : walletBalances ? walletBalances.usdc : "Unavailable"}</strong></div>
                <div><small>WALLET XLM</small><strong>{balancesLoading ? "Reading…" : walletBalances ? walletBalances.xlm : "Unavailable"}</strong></div>
                <button type="button" onClick={() => void refreshWalletBalances()} disabled={balancesLoading}><RefreshCw className={balancesLoading ? "spin" : ""} size={13} /> Refresh</button>
              </div>

              <div className="flow-fields">
                <label><span>MAXIMUM SPEND</span><div className="flow-input"><input value={budget} onChange={(event) => setBudget(event.target.value)} inputMode="decimal" aria-label="Maximum USDC spend" disabled={mandateOnline} /><strong>USDC</strong></div></label>
                <label><span>EXPIRES AFTER</span><select value={duration} onChange={(event) => setDuration(event.target.value)} disabled={mandateOnline}><option value="30">30 minutes</option><option value="60">1 hour</option><option value="360">6 hours</option><option value="1440">24 hours</option></select></label>
              </div>

              <div className="flow-summary">
                <span><ShieldCheck size={15} /></span>
                <p><strong>Your funds stay in your wallet.</strong>Ackrate gives the MandateRegistry contract a capped USDC allowance. The agent never receives the full limit upfront; each payment must pass the on-chain checks.</p>
              </div>

              {!walletBalances?.hasUsdcTrustline && !balancesLoading && (
                <button className="flow-primary flow-outline" type="button" onClick={addUsdc} disabled={phase === "adding-asset"}><CircleDollarSign size={16} />{phase === "adding-asset" ? "Waiting for Freighter…" : "Add Circle USDC to wallet"}</button>
              )}
              {walletBalances?.hasUsdcTrustline && !hasEnoughUsdc && budgetValid && (
                <div className="flow-alert"><TriangleAlert size={16} />Your wallet needs at least {budget} USDC for this limit. Lower the limit or add USDC.</div>
              )}
              {!budgetValid && (
                <div className="flow-alert"><TriangleAlert size={16} />Enter at least {marketplaceService.price} USDC—the exact price of one Agent402 report.</div>
              )}

              {mandateOnline && !mandateMatchesConfig ? (
                <motion.button className="flow-primary flow-danger" type="button" onClick={revoke} disabled={phase === "revoking"} whileTap={reduceMotion ? undefined : { scale: 0.985 }}>
                  {phase === "revoking" ? <LoaderCircle className="spin" size={16} /> : <X size={16} />}{phase === "revoking" ? "Waiting for Freighter…" : "Turn off previous spending limit"}
                </motion.button>
              ) : storedFresh && stored?.registrationTx && !stored.allowanceTx ? (
                <motion.button className="flow-primary" type="button" onClick={retryAllowance} disabled={phase === "approving"} whileTap={reduceMotion ? undefined : { scale: 0.985 }}>
                  {phase === "approving" ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={16} />}{phase === "approving" ? "Waiting for Freighter…" : `Approve ${formatUnits(stored.maxAmount, stored.decimals)} USDC allowance`}
                </motion.button>
              ) : (
                <motion.button className="flow-primary" type="button" onClick={activate} disabled={!canApproveLimit || mandateBusy} whileTap={reduceMotion ? undefined : { scale: 0.985 }}>
                  {mandateBusy ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={16} />}
                  {phase === "registering" ? "Registering limit…" : phase === "approving" ? "Approving USDC…" : `Approve ${budget || "0"} USDC limit`}
                </motion.button>
              )}
              <small className="flow-footnote"><Fingerprint size={12} />Two clear approvals: first register the limit, then approve the contract allowance.</small>
              <div className="flow-secondary-row"><button type="button" onClick={changeMarketplaceService}><Search size={12} />Change service</button><button type="button" onClick={() => setDisconnectOpen(true)}><Power size={12} />Disconnect</button></div>

              {(stored?.registrationTx || stored?.allowanceTx) && (
                <details className="flow-evidence"><summary><span><Database size={13} />Setup transactions</span><ChevronRight size={13} /></summary><div>
                  {stored.registrationTx && <a className="flow-proof-link" href={`${explorer}/tx/${stored.registrationTx}`} target="_blank" rel="noreferrer"><span><Check size={12} />Spending limit</span><code>{short(stored.registrationTx, 6)}</code><ArrowUpRight size={12} /></a>}
                  {stored.allowanceTx && <a className="flow-proof-link" href={`${explorer}/tx/${stored.allowanceTx}`} target="_blank" rel="noreferrer"><span><Check size={12} />USDC approval</span><code>{short(stored.allowanceTx, 6)}</code><ArrowUpRight size={12} /></a>}
                </div></details>
              )}
            </motion.div>
          ) : !completedPurchase ? (
            <motion.div
              key="research"
              className="flow-stage"
              initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeOut" }}
            >
              <div className="flow-stage-heading">
                <div><p className="flow-kicker">STEP 5 OF 6</p><h2>Run {marketplaceService.name}</h2><p className="flow-description">The agent will pass the contract checks, pay Agent402 in real USDC, and return the service output.</p></div>
                <span className="flow-budget"><span><small>REMAINING</small><strong>{remaining} USDC</strong></span></span>
              </div>
              {mandate && config && (
                <AssistantThread
                  mandateId={mandate.id}
                  asset={config.asset.code}
                  service={marketplaceService}
                  parameters={serviceInputValues}
                  price={marketplaceService.price}
                  explorerNetwork={config.explorerNetwork}
                  marketplaceUrl={marketplaceService.docs}
                  onEditConfiguration={() => setServiceConfigured(false)}
                  onPurchaseComplete={setCompletedPurchase}
                />
              )}
              <details className="flow-evidence"><summary><span><ShieldCheck size={13} />Why the agent is allowed to pay</span><ChevronRight size={13} /></summary><div>
                {stored?.registrationTx && <a className="flow-proof-link" href={`${explorer}/tx/${stored.registrationTx}`} target="_blank" rel="noreferrer"><span><Check size={12} />Limit registered</span><code>{short(stored.registrationTx, 6)}</code><ArrowUpRight size={12} /></a>}
                {stored?.allowanceTx && <a className="flow-proof-link" href={`${explorer}/tx/${stored.allowanceTx}`} target="_blank" rel="noreferrer"><span><Check size={12} />Contract allowance</span><code>{short(stored.allowanceTx, 6)}</code><ArrowUpRight size={12} /></a>}
              </div></details>
              <div className="flow-secondary-row"><span>Limit: {currentMandate && config ? formatUnits(currentMandate.maxAmount, config.asset.decimals) : budget} USDC · expires {expires ? new Date(expires * 1_000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "soon"}</span><button type="button" onClick={() => setDisconnectOpen(true)}><Power size={12} />Turn off</button></div>
            </motion.div>
          ) : (
            <motion.div
              key="verify"
              className="flow-stage connect-stage flow-success"
              initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeOut" }}
            >
              <div className="flow-stage-icon success"><Check size={25} /></div>
              <p className="flow-kicker">STEP 6 OF 6</p>
              <h2>{isGuidedResearchService(marketplaceService) ? "Research delivered" : `${marketplaceService.name} delivered`}</h2>
              <p className="flow-description">The contract payment and the real Agent402 x402 payment are independently verifiable on Stellar Mainnet.</p>
              <div className="flow-settlement-grid">
                <a href={`${explorer}/tx/${completedPurchase.payment.txHash}`} target="_blank" rel="noreferrer"><small>01 · ACKRATE CONTRACT</small><strong>{completedPurchase.payment.amount} {completedPurchase.payment.asset}</strong><code>{short(completedPurchase.payment.txHash, 6)}</code><span>Verify <ArrowUpRight size={12} /></span></a>
                {externalSettlement ? <a href={`${explorer}/tx/${externalSettlement.transaction}`} target="_blank" rel="noreferrer"><small>02 · AGENT402 x402</small><strong>{externalSettlement.amount} USDC</strong><code>{short(externalSettlement.transaction, 6)}</code><span>Verify <ArrowUpRight size={12} /></span></a> : <div><small>02 · AGENT402 x402</small><strong>Proof unavailable</strong><span>Do not treat this run as complete.</span></div>}
              </div>
              <a className="flow-primary flow-report-link" href="#paid-service-output"><Sparkles size={16} />{isGuidedResearchService(marketplaceService) ? "Read the cited report" : "Open service output"}</a>
              <div className="flow-secondary-row"><button type="button" onClick={() => setCompletedPurchase(null)}><Search size={12} />Ask another question</button><button type="button" onClick={() => setDisconnectOpen(true)}><Power size={12} />Turn off spending</button></div>
            </motion.div>
          )}
          </AnimatePresence>
        </section>

        <div className="flow-under-card">
          <span><ShieldCheck size={14} />2-of-3 governed MandateRegistry V2</span>
          <a href={config?.mandateRegistryId ? `${stepOneExplorer}/contract/${config.mandateRegistryId}` : "#"} target="_blank" rel="noreferrer">View contract <ArrowUpRight size={13} /></a>
        </div>
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
        <div className="flow-modal-backdrop" role="presentation">
          <section className="flow-modal" role="dialog" aria-modal="true" aria-labelledby="flow-disconnect-title">
            <button className="flow-modal-close" type="button" onClick={() => setDisconnectOpen(false)} aria-label="Close"><X size={16} /></button>
            <Power size={20} />
            {mandateOnline ? (
              <>
                <h2 id="flow-disconnect-title">Turn off spending first</h2>
                <p>This revokes the mandate on Mainnet. Freighter will ask you to approve one final transaction; after it confirms, you can disconnect.</p>
                <button className="flow-primary flow-danger" type="button" onClick={revoke} disabled={phase === "revoking"}>{phase === "revoking" ? <LoaderCircle className="spin" size={16} /> : <X size={16} />}{phase === "revoking" ? "Waiting for Freighter…" : "Turn off spending"}</button>
              </>
            ) : (
              <>
                <h2 id="flow-disconnect-title">Disconnect wallet</h2>
                <p>Spending is off. This clears the saved setup from this browser; it does not delete wallet history.</p>
                {stored?.revokeTx && <a className="flow-proof-link" href={`${explorer}/tx/${stored.revokeTx}`} target="_blank" rel="noreferrer"><span><Check size={12} />Spending turned off</span><code>{short(stored.revokeTx, 6)}</code><ArrowUpRight size={12} /></a>}
                <button className="flow-primary" type="button" onClick={disconnect}><Power size={16} />Disconnect wallet</button>
              </>
            )}
          </section>
        </div>
      )}

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
