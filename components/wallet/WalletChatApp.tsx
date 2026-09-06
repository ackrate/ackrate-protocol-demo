"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  ArrowLeft,
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
  Info,
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
import {
  buildMandate,
  prepareAllowanceTransaction,
  registerWithFreighter,
  revokeWithFreighter,
  submitPreparedAllowanceWithFreighter,
  walletRpcServer,
} from "@/lib/wallet/mandate-client";
import type { MandateView, SafeAppConfig, SessionView } from "@/lib/wallet/types";
import { addTokenToFreighter, connectFreighter, freighterSessionState, signFreighterTransaction } from "@/lib/wallet/freighter";
import { sourceIdForMarketplaceService, WEB_SEARCH_INPUTS, type MarketplaceService } from "@/lib/wallet/marketplace-catalog";
import { AssistantThread, parseRecovery, purchaseResultForMandate, PurchaseReport, type PurchaseResult } from "./AssistantThread";
import { MarketplaceOrb } from "./MarketplaceOrb";
import { ProtocolWorld } from "./ProtocolWorld";
import { initialServiceInputValues, serializedServiceInputs, ServiceConfigurator, type ServiceInputValues } from "./ServiceConfigurator";
import type { MarketplaceQuoteView } from "@/lib/wallet/marketplace-quote";
import { allowanceTransactionIsFresh, canStartFreshWalletLimit, mandateCanAfford, readAllowanceConfirmation, retainWalletMandate, walletAmountAtomic, type PendingAllowance } from "@/lib/wallet/client-readiness";
import { nextWalletNotification, safeWalletError, type WalletNotification } from "@/lib/wallet/notifications";

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
  pendingAllowance?: PendingAllowance;
  pendingRevokeTx?: string;
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
  if (/too late|expired|time.?bound/i.test(detail)) {
    return "The prepared approval expired. Prepare a fresh approval before opening Freighter.";
  }
  return safeWalletError(cause, "Freighter did not finish the allowance request. Open and unlock the extension, then use the approval button below.");
}

function WalletToast({ notification, busy, onDismiss, legacy = false }: { notification: WalletNotification | null; busy: boolean; onDismiss: () => void; legacy?: boolean }) {
  if (!notification) return null;
  const failed = notification.kind === "error";
  return <div className={`${legacy ? "toast" : "flow-toast"}${failed ? " error" : ""}`} role={failed ? "alert" : "status"} aria-atomic="true" style={{ width: "min(440px, calc(100vw - 32px))", alignItems: "start" }}>
    <span aria-hidden="true">{failed ? <TriangleAlert size={16} /> : busy ? <LoaderCircle className="spin" size={16} /> : <Info size={16} />}</span>
    <p style={{ fontSize: 13, lineHeight: 1.55, overflowWrap: "anywhere" }}>{notification.message}</p>
    <button type="button" onClick={onDismiss} aria-label="Dismiss notification" style={{ minWidth: 28, minHeight: 28, color: "#d4d4d4" }}><X size={16} /></button>
  </div>;
}

function mandateStorageKey(config: SafeAppConfig, address: string): string {
  return `ackrate:mandate:v2:${config.network}:${config.mandateRegistryId}:${address}`;
}

function legacyMandateStorageKey(config: SafeAppConfig, address: string): string {
  return `ackrate:mandate:${config.network}:${address}`;
}

function mandateHistoryStorageKey(config: SafeAppConfig, address: string): string {
  return `ackrate:mandate-history:v2:${config.network}:${config.mandateRegistryId}:${address}`;
}

function isHistoricalMandate(value: unknown, config: SafeAppConfig, address: string): value is StoredMandate {
  if (!value || typeof value !== "object") return false;
  const entry = value as StoredMandate;
  return entry.schemaVersion === 2 && entry.user === address && entry.registryId === config.mandateRegistryId
    && typeof entry.id === "string" && /^[0-9a-f]{64}$/.test(entry.id)
    && Number.isSafeInteger(entry.expiry) && entry.expiry > 0
    && typeof entry.maxAmount === "string" && /^\d+$/.test(entry.maxAmount)
    && Number.isSafeInteger(entry.decimals) && entry.decimals >= 0 && entry.decimals <= 18
    && [entry.registrationTx, entry.allowanceTx, entry.pendingRevokeTx, entry.revokeTx].every((hash) => hash === undefined || /^[0-9a-f]{64}$/i.test(hash));
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

function HistoricalWalletReceipt({ record, config }: { record: StoredMandate; config: SafeAppConfig }) {
  const [checking, setChecking] = useState(false);
  const [receipt, setReceipt] = useState<ReturnType<typeof parseRecovery>>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const explorer = `https://stellar.expert/explorer/${config.explorerNetwork}`;
  const checkReceipt = async () => {
    if (checking) return;
    setChecking(true);
    setMessage(null);
    try {
      const body = await api<{ recovery: unknown }>(`/api/wallet/purchase/recovery?mandateId=${encodeURIComponent(record.id)}`, { cache: "no-store" });
      const found = parseRecovery(body.recovery);
      setReceipt(found);
      setResult(null);
      if (!found) setMessage("No retained service-payment receipt was returned for this limit. No new payment was made.");
      else if (found.deliveryState === "ready" && found.paymentConfirmed && found.result !== undefined) {
        const saved = purchaseResultForMandate(found.result, record.id, found.txHash);
        if (!saved) throw new Error("Saved output does not match this limit and payment.");
        setResult(saved);
        setMessage("Saved service output found. Reading it does not make another payment.");
      } else setMessage(found.deliveryState === "reconciliation_required"
        ? "This earlier receipt still needs operator review. A fresh setup does not recover, repay, or refund this purchase."
        : "This earlier receipt is still pending. Checking its status does not run the service or send another payment.");
    } catch (cause) {
      setMessage(safeWalletError(cause, "This saved receipt could not be checked. Its transaction references remain below; no new payment was sent."));
    } finally { setChecking(false); }
  };
  return <details className="flow-history-record">
    <summary>Previous limit · <time dateTime={new Date(record.expiry * 1_000).toISOString()}>expiry {new Date(record.expiry * 1_000).toLocaleString()}</time></summary>
    <p>Historical record · {formatUnits(record.maxAmount, record.decimals)} USDC limit · <code>{short(record.id, 6)}</code></p>
    {record.registrationTx && <TransactionEvidence label="Limit registration" hash={record.registrationTx} explorer={explorer} />}
    {record.allowanceTx && <TransactionEvidence label="Contract allowance" hash={record.allowanceTx} explorer={explorer} />}
    {record.revokeTx && <TransactionEvidence label="Spending turned off" hash={record.revokeTx} explorer={explorer} />}
    {receipt && <TransactionEvidence label={receipt.paymentConfirmed ? "Earlier contract payment" : "Earlier payment record — unconfirmed"} hash={receipt.txHash} explorer={explorer} />}
    <button className="flow-text-button" type="button" onClick={() => void checkReceipt()} disabled={checking}>{checking ? <LoaderCircle className="spin" size={13} /> : <RefreshCw size={13} />}{checking ? "Checking saved receipt…" : "Check saved receipt · no payment"}</button>
    {message && <p role="status">{message}</p>}
    {result && <PurchaseReport result={result} explorerNetwork={config.explorerNetwork} registryId={record.registryId} registrationTx={record.registrationTx} allowanceTx={record.allowanceTx} />}
  </details>;
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
  const [mandateHistory, setMandateHistory] = useState<StoredMandate[]>([]);
  const [mandate, setMandate] = useState<MandateView | null>(null);
  const [budget, setBudget] = useState("0.10");
  const [duration, setDuration] = useState("60");
  const [phase, setPhase] = useState<Phase>("idle");
  const [notification, setNotification] = useState<WalletNotification | null>(null);
  const error = notification?.kind === "error" ? notification.message : null;
  const setNotice = useCallback((value: SetStateAction<string | null>) => {
    setNotification((current) => nextWalletNotification(current, "notice", typeof value === "function"
      ? value(current?.kind === "notice" ? current.message : null) : value));
  }, []);
  const setError = useCallback((value: string | null) => {
    setNotification((current) => nextWalletNotification(current, "error", value));
  }, []);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [revocationProgress, setRevocationProgress] = useState<"wallet" | "confirming" | null>(null);
  const [usdcReady, setUsdcReady] = useState(false);
  const [walletBalances, setWalletBalances] = useState<WalletBalances | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1_000));
  const [completedPurchase, setCompletedPurchase] = useState<PurchaseResult | null>(null);
  const [openedResultTx, setOpenedResultTx] = useState<string | null>(null);
  const resultViewRef = useRef<HTMLDivElement>(null);
  const resultVisible = Boolean(completedPurchase && config && openedResultTx === completedPurchase.payment.txHash);
  const [marketplaceSelected, setMarketplaceSelected] = useState(false);
  const [serviceConfigured, setServiceConfigured] = useState(false);
  const [marketplaceService, setMarketplaceService] = useState<MarketplaceService>(DEFAULT_MARKETPLACE_SERVICE);
  const [serviceInputValues, setServiceInputValues] = useState<ServiceInputValues>(() => initialServiceInputValues(DEFAULT_MARKETPLACE_SERVICE));
  const [marketplaceDraft, setMarketplaceDraft] = useState<MarketplaceService>(DEFAULT_MARKETPLACE_SERVICE);
  const [marketplaceQuery, setMarketplaceQuery] = useState("");
  const [marketplaceServices, setMarketplaceServices] = useState<MarketplaceService[]>([DEFAULT_MARKETPLACE_SERVICE]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [marketplaceCatalog, setMarketplaceCatalog] = useState({ source: "loading", size: 0, matches: 0 });
  const [preparedAllowance, setPreparedAllowance] = useState<{ mandateId: string; xdr: string } | null>(null);
  const [allowancePreparing, setAllowancePreparing] = useState(false);
  const [marketplaceQuote, setMarketplaceQuote] = useState<MarketplaceQuoteView | null>(null);
  const [quoteChecking, setQuoteChecking] = useState(false);
  const [runStarted, setRunStarted] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const approvalInFlight = useRef(false);
  const revocationInFlight = useRef(false);
  const disconnectInFlight = useRef(false);
  const activeMandateId = useRef<string | null>(null);
  const preparedAllowanceReady = Boolean(config && stored && preparedAllowance?.mandateId === stored.id
    && allowanceTransactionIsFresh(preparedAllowance.xdr, config.networkPassphrase, nowSeconds));
  const notificationBusy = allowancePreparing || quoteChecking || disconnecting || !["idle", "active"].includes(phase);

  useEffect(() => {
    if (!resultVisible) return;
    window.scrollTo({ top: 0, behavior: "instant" });
    resultViewRef.current?.focus({ preventScroll: true });
  }, [resultVisible]);

  useEffect(() => {
    if (!notification || notification.kind === "error" || notificationBusy) return;
    const timer = window.setTimeout(() => setNotification((current) => current === notification ? null : current), 8_000);
    return () => window.clearTimeout(timer);
  }, [notification, notificationBusy]);

  const refreshMandate = useCallback(async (current: StoredMandate) => {
    const body = await api<{ mandate: MandateView }>("/api/wallet/mandate/status", {
      method: "POST",
      body: JSON.stringify({ mandateId: current.id }),
    });
    if (activeMandateId.current === current.id) {
      setMandate(body.mandate);
      if (!revocationInFlight.current) {
        setPhase(body.mandate.status === "Active" && body.mandate.expiry > Math.floor(Date.now() / 1_000) ? "active" : "idle");
      }
    }
    return body.mandate;
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1_000)), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (stored?.allowanceTx && stored.expiry <= nowSeconds) {
      setNotice((current) => current === "Spending limit approved. The agent is ready."
        ? "This spending limit has expired. Existing payment receipts are still recoverable." : current);
    }
  }, [nowSeconds, stored?.allowanceTx, stored?.expiry]);

  useEffect(() => {
    Promise.all([
      api<{ config: SafeAppConfig }>("/api/wallet/config"),
      api<{ session: SessionView }>("/api/wallet/auth/session"),
    ]).then(([configResult, sessionResult]) => {
      setConfig(configResult.config);
      setSession(sessionResult.session);
      if (sessionResult.session.address) setWalletAddress(sessionResult.session.address);
    }).catch((cause) => setError(safeWalletError(cause, "Wallet setup could not load. Refresh the page to try again.")));
  }, []);

  useEffect(() => {
    if (!session.authenticated || !session.address) return;
    let active = true;
    let checking = false;
    const checkConnection = async () => {
      if (checking) return;
      checking = true;
      try {
        const state = await freighterSessionState(session.address!);
        if (!active || state !== "disconnected") return;
        await api("/api/wallet/auth/session", { method: "DELETE", body: "{}" });
        if (active) window.location.reload();
      } catch {
        // Keep the session when the extension or sign-out request is unavailable.
      } finally {
        checking = false;
      }
    };
    void checkConnection();
    window.addEventListener("focus", checkConnection);
    return () => {
      active = false;
      window.removeEventListener("focus", checkConnection);
    };
  }, [session.address, session.authenticated]);

  useEffect(() => {
    if (!config || !session.authenticated || !session.address) return;
    const key = mandateStorageKey(config, session.address);
    try {
      const history: unknown = JSON.parse(localStorage.getItem(mandateHistoryStorageKey(config, session.address)) ?? "[]");
      setMandateHistory(Array.isArray(history) ? history.filter((entry): entry is StoredMandate => isHistoricalMandate(entry, config, session.address!)) : []);
    } catch { setMandateHistory([]); }
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
      activeMandateId.current = parsed.id;
      if (isHistoricalMandate(parsed, config, session.address)) setBudget(formatUnits(parsed.maxAmount, parsed.decimals));
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
      setError(safeWalletError(cause, "Wallet balances could not refresh. Use Refresh before setting a limit."));
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
    if (
      !config
      || !stored?.registrationTx
      || stored.allowanceTx
      || stored.pendingAllowance
      || stored.expiry <= Math.floor(Date.now() / 1_000)
      || preparedAllowanceReady
      || approvalInFlight.current
    ) return;
    let active = true;
    setAllowancePreparing(true);
    void prepareAllowanceTransaction(config, storedToIntent(stored))
      .then((xdr) => {
        if (active) setPreparedAllowance({ mandateId: stored.id, xdr });
      })
      .catch((cause) => {
        console.error("USDC allowance preparation failed", cause);
        if (active) setError("The network could not prepare your USDC approval. No Freighter request has been sent yet. Use Prepare approval to retry.");
      })
      .finally(() => {
        if (active) setAllowancePreparing(false);
      });
    return () => { active = false; };
  }, [config, preparedAllowanceReady, stored?.allowanceTx, stored?.pendingAllowance?.txHash, stored?.expiry, stored?.id, stored?.registrationTx]);

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
        setError(safeWalletError(cause, "Marketplace services could not load. Search again in a moment."));
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
    activeMandateId.current = value.id;
  }, [config]);

  const startFreshLimit = () => {
    if (!config || !session.address || !stored || notificationBusy || runBusy || approvalInFlight.current
      || !canStartFreshWalletLimit(stored, mandate)) return;
    try {
      const key = mandateHistoryStorageKey(config, session.address);
      const retained: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (!Array.isArray(retained)) throw new Error("Saved history could not be read.");
      // Preserve first; if saving fails, leave the active record and workflow untouched.
      const history = retainWalletMandate(retained, stored);
      localStorage.setItem(key, JSON.stringify(history));
      localStorage.removeItem(mandateStorageKey(config, session.address));
      setMandateHistory(history.filter((entry): entry is StoredMandate => isHistoricalMandate(entry, config, session.address!)));
      activeMandateId.current = null;
      setStored(null);
      setMandate(null);
      setPreparedAllowance(null);
      setCompletedPurchase(null);
      setRunStarted(false);
      setMarketplaceQuote(null);
      setServiceConfigured(false);
      setPhase("idle");
      setError(null);
      setNotice("Previous limit and receipt references saved below. Review the inputs for a fresh price, then approve a new limit. No payment was made.");
    } catch {
      setError("The previous record could not be saved in this browser. Nothing was cleared and no new setup was started.");
    }
  };

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
      setError(safeWalletError(cause, "Could not connect. Open and unlock Freighter, choose Mainnet, then connect again."));
      setNotice(null);
      setPhase("idle");
    }
  };

  const authenticate = async () => {
    if (!config || !walletAddress) return;
    setError(null);
    if (walletAddress === config.contractAuthorityAddress) {
      setError("This is the contract's 2-of-3 governance account. Use a separate personal Mainnet wallet here.");
      setPhase("idle");
      return;
    }
    setPhase("authenticating");
    try {
      const challenge = await api<{ transactionXdr: string }>("/api/wallet/auth/challenge", {
        method: "POST",
        body: JSON.stringify({ address: walletAddress }),
      });
      setNotice("Confirm the sign-in request in Freighter to prove this wallet is yours. No payment or spending permission is granted.");
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
      setNotice("Signed in. You can now choose a marketplace service.");
      setPhase("idle");
    } catch (cause) {
      setError(safeWalletError(cause, "Wallet verification did not finish. Open Freighter to complete the sign-in request; it does not make a payment."));
      setNotice(null);
      setPhase("idle");
    }
  };

  const activate = async () => {
    if (!config || !session.address || !config.ready) return;
    if (!marketplaceQuote || marketplaceQuote.expiresAt <= Math.floor(Date.now() / 1_000)) {
      setServiceConfigured(false);
      setError("Review the service inputs again to refresh its price and seller before approving.");
      return;
    }
    const requested = walletAmountAtomic(budget, config.asset.decimals);
    const minimum = walletAmountAtomic(marketplaceQuote.price, config.asset.decimals);
    const available = walletBalances ? walletAmountAtomic(walletBalances.usdcRaw, config.asset.decimals) : null;
    if (requested === null || minimum === null || requested <= 0n || requested < minimum
      || available === null || requested > available || !walletBalances?.hasUsdcTrustline) {
      setError(`Choose a valid limit of at least ${marketplaceQuote.price} USDC within your wallet balance.`);
      return;
    }
    setError(null);
    setCompletedPurchase(null);
    if (session.address === config.contractAuthorityAddress) {
      setError("This is the contract's governance account. Disconnect it and connect a separate personal Mainnet wallet.");
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
      setNotice("Limit registered. Preparing the final USDC approval now.");
    } catch (cause) {
      setError(safeWalletError(cause, "Limit registration did not finish. Check Freighter for a pending request before signing another registration."));
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
        setError(safeWalletError(cause, "USDC setup did not finish. Open Freighter and check its pending request."));
        setNotice(null);
      }
    } finally {
      setPhase("idle");
    }
  };

  const retryAllowance = async () => {
    if (!config || !stored || approvalInFlight.current) return;
    if (stored.pendingAllowance) {
      approvalInFlight.current = true;
      setPhase("approving");
      setError(null);
      setNotice("Checking the existing allowance transaction. No new wallet signature or fee is requested.");
      try {
        const status = await readAllowanceConfirmation(config.rpcUrl, config.networkPassphrase, {
          user: stored.user, asset: stored.asset, spender: config.mandateRegistryId, maxAmount: stored.maxAmount,
        }, stored.pendingAllowance);
        if (status === "confirmed") {
          const next = { ...stored, allowanceTx: stored.pendingAllowance.txHash, pendingAllowance: undefined };
          saveStored(next);
          const confirmed = await refreshMandate(next);
          setNotice(confirmed.status === "Active" && confirmed.expiry > Math.floor(Date.now() / 1_000)
            ? "Spending limit approved. The agent is ready."
            : "Allowance confirmed, but this spending limit is no longer active. Existing receipts remain recoverable.");
        } else if (status === "failed" || status === "expired") {
          saveStored({ ...stored, pendingAllowance: undefined });
          setPreparedAllowance(null);
          setNotice("The previous allowance did not succeed. A fresh approval can now be prepared.");
        } else {
          setNotice("The allowance is still unconfirmed. Check again in a moment; no new transaction was sent.");
        }
      } catch (cause) {
        console.error("USDC allowance confirmation check failed", cause);
        setError("The existing allowance could not be confirmed yet. Check again; no new approval or fee was requested.");
      } finally {
        approvalInFlight.current = false;
        setPhase("idle");
      }
      return;
    }
    if (stored.expiry <= Math.floor(Date.now() / 1_000)) {
      setPreparedAllowance(null);
      setError("The registered limit has expired. Set a new limit before approving an allowance.");
      return;
    }
    if (!marketplaceQuote || marketplaceQuote.expiresAt <= Math.floor(Date.now() / 1_000)) {
      setServiceConfigured(false);
      setError("Review the service inputs again to refresh its price and seller before approving.");
      return;
    }
    setError(null);
    const intent = storedToIntent(stored);
    let prepared = preparedAllowance?.mandateId === stored.id
      && allowanceTransactionIsFresh(preparedAllowance.xdr, config.networkPassphrase) ? preparedAllowance.xdr : null;
    approvalInFlight.current = true;
    if (!prepared) {
      setPreparedAllowance(null);
      setAllowancePreparing(true);
      setNotice("Preparing the USDC approval. The Freighter button will unlock in a moment.");
      try {
        prepared = await prepareAllowanceTransaction(config, intent);
        setPreparedAllowance({ mandateId: stored.id, xdr: prepared });
        setNotice("Approval ready. Click Open Freighter to confirm it.");
      } catch (cause) {
        console.error("USDC allowance preparation failed", cause);
        setError("The approval could not be prepared yet. Wait a moment and try again.");
      } finally {
        setAllowancePreparing(false);
        approvalInFlight.current = false;
      }
      return;
    }
    setPhase("approving");
    setNotice("Opening Freighter now. Approve the single USDC allowance transaction.");
    let submitted = stored;
    try {
      const allowanceTx = await submitPreparedAllowanceWithFreighter(config, intent, prepared, (pendingAllowance) => {
        submitted = { ...stored, pendingAllowance };
        saveStored(submitted);
      });
      const next = { ...submitted, allowanceTx, pendingAllowance: undefined };
      saveStored(next);
      setPreparedAllowance(null);
      const confirmed = await refreshMandate(next);
      setNotice(confirmed.status === "Active" && confirmed.expiry > Math.floor(Date.now() / 1_000)
        ? "Spending limit approved. The agent is ready."
        : "Allowance confirmed, but this spending limit is no longer active. Existing receipts remain recoverable.");
    } catch (cause) {
      console.error("USDC allowance approval failed", cause);
      setError(submitted.pendingAllowance
        ? "The allowance was signed, but confirmation has not finished. Check the existing approval below; do not approve another transaction."
        : allowanceFailureMessage(cause));
      setPreparedAllowance(null);
      setPhase("idle");
    } finally {
      approvalInFlight.current = false;
    }
  };

  const confirmServiceInputs = async () => {
    const sourceId = sourceIdForMarketplaceService(marketplaceService);
    if (!sourceId || quoteChecking) return;
    setQuoteChecking(true);
    setMarketplaceQuote(null);
    setError(null);
    setNotice("Checking the service inputs, price, and seller. No payment is being made.");
    try {
      const { quote } = await api<{ quote: MarketplaceQuoteView }>("/api/wallet/marketplace/quote", {
        method: "POST",
        body: JSON.stringify({ sourceId, parameters: serializedServiceInputs(marketplaceService, serviceInputValues) }),
      });
      setMarketplaceQuote(quote);
      setServiceConfigured(true);
      setNotice(`Seller checked. ${quote.price} USDC per call. No payment was made.`);
    } catch (cause) {
      setError(safeWalletError(cause, "The seller's payment details could not be verified. Check the price again; no payment was made."));
    } finally {
      setQuoteChecking(false);
    }
  };

  const revoke = async (disconnectAfter = false) => {
    if (!config || !stored || revocationInFlight.current || disconnectInFlight.current) return;
    revocationInFlight.current = true;
    setError(null);
    setPhase("revoking");
    setRevocationProgress("confirming");
    setNotice("Checking the existing spending limit. No transaction is being sent yet.");
    let confirmed: MandateView | null = null;
    try {
      let current = stored;
      confirmed = await refreshMandate(current);
      // A confirmed receipt must only be reconciled, never submitted a second time.
      if (confirmed.status !== "Revoked" && !current.revokeTx && !current.pendingRevokeTx) {
        setRevocationProgress("wallet");
        setNotice("Confirm Turn off spending in Freighter. We will wait for Stellar confirmation.");
        const address = await connectFreighter(config.networkPassphrase);
        if (address !== current.user) throw new Error("Select the same wallet you connected to Ackrate");
        const revokeTx = await revokeWithFreighter(config, storedToIntent(current), (hash) => {
          current = { ...current, pendingRevokeTx: hash };
          setStored(current);
          saveStored(current);
          setRevocationProgress("confirming");
          setNotice("Transaction submitted. Waiting for Stellar to confirm spending is off…");
        });
        current = { ...current, revokeTx, pendingRevokeTx: undefined };
        saveStored(current);
      }
      setRevocationProgress("confirming");
      if (current.pendingRevokeTx && confirmed.status !== "Revoked") {
        const existing = await walletRpcServer(config).getTransaction(current.pendingRevokeTx);
        if (existing.status === "FAILED") {
          saveStored({ ...current, pendingRevokeTx: undefined });
          throw new Error("The previous revocation failed on Stellar. Spending is not confirmed off. Try Turn off spending again if you want to submit a new transaction.");
        }
      }
      // Allow the read endpoint to catch up with the confirmed transaction.
      for (let attempt = 0; confirmed.status !== "Revoked" && attempt < 10; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        confirmed = await refreshMandate(current);
      }
      if (confirmed.status !== "Revoked") {
        throw new Error("The existing revocation is saved, but Stellar has not confirmed the mandate is revoked yet. Check again; no new transaction will be sent.");
      }
      if (disconnectAfter) {
        await finishDisconnect(confirmed);
      } else {
        setNotice("Spending is off. The mandate is revoked.");
      }
    } catch (cause) {
      setError(safeWalletError(cause, "Spending could not be confirmed off. Keep the same wallet selected and check the existing transaction before trying again."));
    } finally {
      revocationInFlight.current = false;
      setRevocationProgress(null);
      if (!disconnectInFlight.current) setPhase(confirmed?.status === "Active" ? "active" : "idle");
    }
  };

  const finishDisconnect = async (confirmedMandate?: MandateView) => {
    if (disconnectInFlight.current) return;
    const latest = confirmedMandate ?? mandate;
    if (confirmedMandate && (confirmedMandate.id !== stored?.id || confirmedMandate.user !== session.address)) {
      throw new Error("The confirmed spending limit does not match this wallet.");
    }
    if (latest?.status === "Active" && latest.expiry > Math.floor(Date.now() / 1_000)) {
      setNotice("First tap Turn off spending below. Then disconnect your wallet.");
      return;
    }

    disconnectInFlight.current = true;
    setError(null);
    setDisconnecting(true);
    setNotice("Spending is off. Disconnecting your wallet…");
    try {
      await api("/api/wallet/auth/session", { method: "DELETE", body: "{}" });
    } catch (cause) {
      setError("Spending is off, but sign-out did not finish. Retry Disconnect wallet; no new transaction or fee is needed.");
      disconnectInFlight.current = false;
      setDisconnecting(false);
      return;
    }

    if (config && session.address) {
      localStorage.removeItem(mandateStorageKey(config, session.address));
      localStorage.removeItem(legacyMandateStorageKey(config, session.address));
    }
    if (session.address) localStorage.removeItem(marketplaceStorageKey(session.address));
    localStorage.removeItem("ackrate:mainnet:last-payment");
    setSession(emptySession);
    setWalletAddress(null);
    activeMandateId.current = null;
    setMandate(null);
    setStored(null);
    setPreparedAllowance(null);
    setAllowancePreparing(false);
    setUsdcReady(false);
    setWalletBalances(null);
    setCompletedPurchase(null);
    setMarketplaceSelected(false);
    setMarketplaceQuote(null);
    setRunStarted(false);
    setServiceConfigured(false);
    setMarketplaceService(DEFAULT_MARKETPLACE_SERVICE);
    setMarketplaceDraft(DEFAULT_MARKETPLACE_SERVICE);
    setServiceInputValues(initialServiceInputValues(DEFAULT_MARKETPLACE_SERVICE));
    setMarketplaceQuery("");
    setPhase("idle");
    setDisconnectOpen(false);
    setNotice("Wallet disconnected. Connect a wallet to start again.");
    // Reload only after the cookie is cleared so pending requests cannot restore old setup.
    window.location.reload();
  };

  const disconnect = () => finishDisconnect();

  const chooseMarketplaceService = () => {
    if (!session.address) return;
    localStorage.setItem(marketplaceStorageKey(session.address), JSON.stringify(marketplaceDraft));
    setMarketplaceService(marketplaceDraft);
    setServiceInputValues(initialServiceInputValues(marketplaceDraft));
    setMarketplaceSelected(true);
    setServiceConfigured(false);
    setMarketplaceQuote(null);
    setCompletedPurchase(null);
    setRunStarted(false);
    setError(null);
    setNotice(`${marketplaceDraft.name} selected. Configure its published inputs next.`);
  };

  const changeMarketplaceService = () => {
    setMarketplaceDraft(marketplaceService);
    setMarketplaceQuery("");
    setMarketplaceSelected(false);
    setServiceConfigured(false);
    setMarketplaceQuote(null);
    setCompletedPurchase(null);
    setRunStarted(false);
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
  const historicalCurrent = Boolean(stored && (!storedFresh || (mandate?.id === stored.id && mandate.status !== "Active")));
  const canCreateFreshLimit = canStartFreshWalletLimit(stored, mandate, nowSeconds);
  const servicePrice = marketplaceQuote?.price ?? marketplaceService.price;
  const enoughRemaining = mandateCanAfford(mandate?.remaining, servicePrice, config?.asset.decimals ?? 7);
  const quoteCurrent = Boolean(marketplaceQuote && marketplaceQuote.expiresAt > nowSeconds);
  const activeMandateReady = Boolean(mandateOnline && mandateMatchesConfig && storedFresh && stored?.allowanceTx && enoughRemaining);
  const recoverableRun = Boolean(stored?.allowanceTx && mandateMatchesConfig && mandate?.id === stored.id
    && (runStarted || mandate.status !== "Active" || !storedFresh || !enoughRemaining));
  const showRun = activeMandateReady || recoverableRun || Boolean(completedPurchase);
  const currentMandate = mandateMatchesConfig ? mandate : null;
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
                  <button id="turn-off-mandate" className="danger-button" onClick={() => revoke()} disabled={phase === "revoking"}><X size={15} /> {phase === "revoking" ? "Confirming spending is off…" : "Turn off spending"}</button>
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
                  <button className="danger-button" onClick={() => revoke(true)} disabled={phase === "revoking" || disconnecting}>
                    <X size={16} /> {phase === "revoking" || disconnecting ? "Confirming and disconnecting…" : "Turn off spending"}
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

        <WalletToast notification={notification} busy={notificationBusy} legacy onDismiss={() => setNotification(null)} />

        <footer className="footer shell"><div><ShieldCheck size={15} /> Your spending limit is checked every time</div><p>Ackrate decides if a payment is allowed.</p><Link href="/wallet/diagnostics">Technical details <ArrowUpRight size={13} /></Link></footer>
      </main>
    );
  }

  const connected = session.authenticated && Boolean(session.address);
  const stepOneExplorer = config ? `https://stellar.expert/explorer/${config.explorerNetwork}` : "#";
  const workflowStep = !connected ? 1 : !marketplaceSelected ? 2 : !serviceConfigured ? 3 : !showRun ? 4 : !completedPurchase ? 5 : 6;
  const budgetAtomic = walletAmountAtomic(budget, config?.asset.decimals ?? 7);
  const minimumBudget = walletAmountAtomic(servicePrice, config?.asset.decimals ?? 7);
  const availableUsdc = walletBalances ? walletAmountAtomic(walletBalances.usdcRaw, config?.asset.decimals ?? 7) : null;
  const budgetValid = budgetAtomic !== null && minimumBudget !== null && budgetAtomic >= minimumBudget && budgetAtomic > 0n;
  const hasEnoughUsdc = budgetAtomic !== null && availableUsdc !== null && availableUsdc >= budgetAtomic;
  const budgetRunCount = budgetAtomic !== null && minimumBudget !== null && minimumBudget > 0n ? budgetAtomic / minimumBudget : null;
  const canApproveLimit = Boolean(config?.ready && !mandateOnline && !stored?.pendingAllowance && quoteCurrent && budgetValid && walletBalances?.hasUsdcTrustline && hasEnoughUsdc);
  const externalSettlement = completedPurchase ? marketplaceSettlement(completedPurchase) : null;
  const navState = (step: number) => workflowStep > step ? "done" : workflowStep === step ? "current" : "";

  return (
    <main className={`wallet-preview wallet-flow spatial-step-${workflowStep}${resultVisible ? " wallet-result-mode" : ""}`}>
      {!resultVisible && <ProtocolWorld step={workflowStep} reducedMotion={Boolean(reduceMotion)} />}
      <header className="flow-header">
        <Link href="/" className="flow-brand"><span className="flow-brand-mark"><MarketplaceOrb variant="brand" /></span><strong>ACKRATE</strong></Link>
        <div className="flow-network"><span />{config?.networkLabel ?? "Loading Mainnet"}</div>
        <div className="flow-header-actions">
          {(connected || walletAddress) && (
            <button
              className="flow-text-button flow-disconnect"
              type="button"
              onClick={connected ? () => setDisconnectOpen(true) : disconnect}
              disabled={disconnecting || phase === "authenticating" || phase === "registering" || phase === "approving" || phase === "revoking"}
            >
              <Power size={13} />{disconnecting ? "Disconnecting…" : "Disconnect wallet"}
            </button>
          )}
          <Link className="flow-text-button" href="/wallet/diagnostics">Verification <ArrowUpRight size={13} /></Link>
        </div>
      </header>

      {!resultVisible && <section className={`flow-shell ${connected ? "flow-shell-active" : ""}`}>
        <motion.div
          className="flow-intro"
          initial={reduceMotion ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.42, ease: "easeOut" }}
        >
          <p>THE ENFORCEMENT LAYER FOR AGENT PAYMENTS</p>
          <h1>Give agents buying power.<br />Not a blank check.</h1>
          <span>One mandate unlocks real x402 services. ACKRATE enforces who gets paid, how much, and when—on-chain.</span>
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

        {historicalCurrent && stored && <section className="flow-history flow-history-current" aria-label="Previous spending limit">
          <div><strong>{stored.expiry <= nowSeconds ? "Your previous spending limit has expired" : "Your previous spending limit is inactive"}</strong>
            <p>This is an earlier setup, not a new service run. It expires at <time dateTime={new Date(stored.expiry * 1_000).toISOString()}>{new Date(stored.expiry * 1_000).toLocaleString()}</time>. Its unused limit is not available for a new payment.</p>
            <p>Keep the previous receipt for review. A fresh limit is a separate authorization; it does not retry, recover, or refund the earlier purchase.</p></div>
          {canCreateFreshLimit && <button className="flow-primary" type="button" onClick={startFreshLimit} disabled={notificationBusy || runBusy}>Create a fresh spending limit <ChevronRight size={16} /></button>}
          {stored.pendingAllowance && <p>Check the existing USDC approval before starting a separate setup. No replacement approval will be sent automatically.</p>}
        </section>}

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
              <h2>{walletAddress ? "Sign in with your wallet" : "Connect your wallet"}</h2>
              <p className="flow-description">{walletAddress ? "Your wallet is connected. Confirm ownership before choosing a service." : "Connect a personal Freighter wallet on Stellar Mainnet, then sign in to prove it belongs to you."}</p>
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
                aria-describedby="wallet-sign-in-note"
                disabled={!config || phase === "authenticating"}
                whileHover={reduceMotion || !config || phase === "authenticating" ? undefined : { y: -2, scale: 1.005 }}
                whileTap={reduceMotion || !config || phase === "authenticating" ? undefined : { scale: 0.985 }}
              >
                {phase === "authenticating" ? <LoaderCircle className="spin" size={17} /> : <WalletCards size={17} />}
                {phase === "authenticating" ? "Waiting for Freighter…" : walletAddress ? "Sign in with Freighter" : "Connect Freighter"}
              </motion.button>
              <small className="flow-footnote wallet-sign-in-note"><LockKeyhole size={12} aria-hidden="true" /><em id="wallet-sign-in-note">{walletAddress ? "Confirm in Freighter to prove this wallet is yours and sign in. This does not authorize spending. Freighter may show a fee, but we do not submit this request to Stellar, so no fee is charged." : "Connecting shares your public wallet address. Next, you will sign in to prove ownership. Neither step makes a payment or authorizes spending."}</em></small>
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
              <small className="flow-footnote"><LockKeyhole size={12} />Choosing a service does not move funds. Payment happens only when you run the service.</small>
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
                  <p className="flow-description">Enter the inputs published for this Agent402 service. We check its payment details before you continue.</p>
                </div>
                <span className="flow-wallet-chip"><Globe2 size={13} />{marketplaceService.schemaSource === "agent402-find" ? "API SCHEMA" : "DOCUMENTED INPUTS"}</span>
              </div>
              <ServiceConfigurator
                service={marketplaceService}
                values={serviceInputValues}
                executable={isRunnableMarketplaceService(marketplaceService)}
                busy={quoteChecking}
                onChange={(values) => { setServiceInputValues(values); setMarketplaceQuote(null); }}
                onBack={changeMarketplaceService}
                onContinue={() => void confirmServiceInputs()}
              />
            </motion.div>
          ) : !showRun ? (
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
                <span className="service-price">{marketplaceQuote?.price ?? marketplaceService.price} <small>USDC / CALL</small></span>
              </div>

              {!quoteCurrent && !stored?.pendingAllowance && <div className="flow-alert"><TriangleAlert size={16} /><span>The service quote expired. <button type="button" onClick={() => setServiceConfigured(false)}>Review service inputs</button> to check the current price and seller before approving.</span></div>}

              {marketplaceQuote && <div className="flow-settlement-route">
                <p><strong>One service purchase. Two settlement receipts.</strong> The contract enforces your wallet’s cap and pays the relay. The relay pays the marketplace seller below. Seller routing is enforced by this app, not by your mandate.</p>
                <div><span>Contract recipient · relay</span><a href={`${explorer}/account/${marketplaceQuote.relay}`} target="_blank" rel="noreferrer" title={marketplaceQuote.relay}>{short(marketplaceQuote.relay, 8)} <ArrowUpRight size={12} /></a></div>
                <div><span>Marketplace seller · from HTTP 402</span><a href={`${explorer}/account/${marketplaceQuote.payTo}`} target="_blank" rel="noreferrer" title={marketplaceQuote.payTo}>{short(marketplaceQuote.payTo, 8)} <ArrowUpRight size={12} /></a></div>
              </div>}

              <div className="flow-balance-grid">
                <div><small>WALLET USDC</small><strong>{balancesLoading ? "Reading…" : walletBalances ? walletBalances.usdc : "Unavailable"}</strong></div>
                <div><small>WALLET XLM</small><strong>{balancesLoading ? "Reading…" : walletBalances ? walletBalances.xlm : "Unavailable"}</strong></div>
                <button type="button" onClick={() => void refreshWalletBalances()} disabled={balancesLoading}><RefreshCw className={balancesLoading ? "spin" : ""} size={13} /> Refresh</button>
              </div>

              <div className="flow-fields">
                <label><span>MAXIMUM SPEND</span><div className="flow-input"><input value={budget} onChange={(event) => setBudget(event.target.value)} inputMode="decimal" aria-label="Maximum USDC spend" disabled={mandateOnline} /><strong>USDC</strong></div></label>
                <label><span>EXPIRES AFTER</span><select value={duration} onChange={(event) => setDuration(event.target.value)} disabled={mandateOnline}><option value="30">30 minutes</option><option value="60">1 hour</option><option value="360">6 hours</option><option value="1440">24 hours</option></select></label>
              </div>
              {quoteCurrent && minimumBudget !== null && minimumBudget > 0n && <div className="flow-budget-preview">
                <p><strong>{servicePrice} USDC per run</strong>{budgetRunCount !== null ? ` · Your ${budget} USDC limit covers up to ${budgetRunCount.toString()} ${budgetRunCount === 1n ? "run" : "runs"} at this quoted price.` : " · Choose how many runs to allow."}</p>
                <div className="flow-budget-presets" aria-label="Spending limit presets">
                  {[1n, 2n].map((count) => <button className="flow-text-button" type="button" key={count.toString()} disabled={mandateOnline || Boolean(stored?.pendingAllowance)} onClick={() => setBudget(formatUnits((minimumBudget * count).toString(), config?.asset.decimals ?? 7))}>{count.toString()} {count === 1n ? "run" : "runs"} · {formatUnits((minimumBudget * count).toString(), config?.asset.decimals ?? 7)} USDC</button>)}
                </div>
                <small>This is a cap, not a deposit. Only a submitted run spends its service price; transaction fees use XLM.</small>
              </div>}

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
                <div className="flow-alert"><TriangleAlert size={16} />Enter at least {servicePrice} USDC—the price of one service call—with no more than {config?.asset.decimals ?? 7} decimal places.</div>
              )}

              {mandateOnline && !mandateMatchesConfig ? (
                <motion.button className="flow-primary flow-danger" type="button" onClick={() => revoke()} disabled={phase === "revoking"} whileTap={reduceMotion ? undefined : { scale: 0.985 }}>
                  {phase === "revoking" ? <LoaderCircle className="spin" size={16} /> : <X size={16} />}{phase === "revoking" ? revocationProgress === "wallet" ? "Waiting for Freighter…" : "Confirming on Stellar…" : "Turn off previous spending limit"}
                </motion.button>
              ) : stored?.pendingAllowance || (storedFresh && stored?.registrationTx && !stored.allowanceTx) ? (
                <motion.button className="flow-primary" type="button" onClick={retryAllowance} disabled={phase === "approving" || allowancePreparing} whileTap={reduceMotion ? undefined : { scale: 0.985 }}>
                  {phase === "approving" || allowancePreparing ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={16} />}
                  {stored.pendingAllowance ? phase === "approving" ? "Checking existing approval…" : "Check USDC approval — no new fee" : allowancePreparing ? "Preparing secure approval…" : phase === "approving" ? "Opening Freighter…" : !preparedAllowanceReady ? "Prepare approval" : `Open Freighter · Approve ${formatUnits(stored.maxAmount, stored.decimals)} USDC`}
                </motion.button>
              ) : (
                <motion.button className="flow-primary" type="button" onClick={activate} disabled={!canApproveLimit || mandateBusy} whileTap={reduceMotion ? undefined : { scale: 0.985 }}>
                  {mandateBusy ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={16} />}
                  {phase === "registering" ? "Registering limit…" : phase === "approving" ? "Approving USDC…" : `Approve ${budget || "0"} USDC limit`}
                </motion.button>
              )}
              <small className="flow-footnote"><Fingerprint size={12} />Approval 1 registers the mandate. Approval 2 opens Freighter and caps the contract allowance.</small>
              <div className="flow-secondary-row"><button type="button" onClick={changeMarketplaceService}><Search size={12} />Change service</button><button type="button" onClick={() => setDisconnectOpen(true)}><Power size={12} />Disconnect</button></div>

              {(stored?.registrationTx || stored?.allowanceTx) && (
                <details className="flow-evidence"><summary><span><Database size={13} />Setup transactions</span><ChevronRight size={13} /></summary><div>
                  {stored.registrationTx && <a className="flow-proof-link" href={`${explorer}/tx/${stored.registrationTx}`} target="_blank" rel="noreferrer"><span><Check size={12} />Spending limit</span><code>{short(stored.registrationTx, 6)}</code><ArrowUpRight size={12} /></a>}
                  {stored.allowanceTx && <a className="flow-proof-link" href={`${explorer}/tx/${stored.allowanceTx}`} target="_blank" rel="noreferrer"><span><Check size={12} />USDC approval</span><code>{short(stored.allowanceTx, 6)}</code><ArrowUpRight size={12} /></a>}
                  {stored.pendingAllowance && <a className="flow-proof-link" href={`${explorer}/tx/${stored.pendingAllowance.txHash}`} target="_blank" rel="noreferrer"><span><Clock3 size={12} />Allowance awaiting confirmation</span><code>{short(stored.pendingAllowance.txHash, 6)}</code><ArrowUpRight size={12} /></a>}
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
                <div><p className="flow-kicker">{historicalCurrent ? "PREVIOUS RUN · RECEIPT ONLY" : "STEP 5 OF 6"}</p><h2>{historicalCurrent ? "Review your earlier payment" : `Run ${marketplaceService.name}`}</h2><p className="flow-description">{historicalCurrent ? "This saved limit is no longer usable. Check its existing receipt, or create a fresh spending limit above for a separate request." : "The agent will pass the contract checks, pay Agent402 in real USDC, and return the service output."}</p></div>
                <span className="flow-budget"><span><small>{historicalCurrent ? "UNUSED · NOT SPENDABLE" : "REMAINING"}</small><strong>{remaining} USDC</strong></span></span>
              </div>
              {!historicalCurrent && !quoteCurrent && <div className="flow-alert"><TriangleAlert size={16} />The service quote expired. Edit the inputs to refresh its price and seller before running.</div>}
              {mandateOnline && !enoughRemaining && <div className="flow-alert"><TriangleAlert size={16} />This mandate has less than {servicePrice} USDC remaining. Existing receipts can still be recovered; turn off this limit before creating another.</div>}
              {mandate && config && (
                <AssistantThread
                  key={mandate.id}
                  mandateId={mandate.id}
                  asset={config.asset.code}
                  service={marketplaceService}
                  parameters={serviceInputValues}
                  quoteToken={marketplaceQuote?.token}
                  canRun={activeMandateReady && quoteCurrent}
                  onRunStarted={() => { setNotification(null); setRunStarted(true); }}
                  onBusyChange={setRunBusy}
                  price={servicePrice}
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
              <div className="flow-secondary-row"><span>Limit: {currentMandate && config ? formatUnits(currentMandate.maxAmount, config.asset.decimals) : budget} USDC · {historicalCurrent ? "expiry" : "expires"} {expires ? new Date(expires * 1_000).toLocaleString() : "unconfirmed"}</span><button type="button" onClick={() => setDisconnectOpen(true)}><Power size={12} />{historicalCurrent ? "Disconnect" : "Turn off"}</button></div>
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
              <button className="flow-primary flow-report-link" type="button" onClick={() => setOpenedResultTx(completedPurchase.payment.txHash)}><Sparkles size={16} />{isGuidedResearchService(marketplaceService) ? "Read the cited report" : "Open service output"}</button>
              <div className="flow-secondary-row"><button type="button" onClick={() => { setCompletedPurchase(null); setServiceConfigured(false); setMarketplaceQuote(null); setRunStarted(false); }}><Search size={12} />Configure another request</button><button type="button" onClick={() => setDisconnectOpen(true)}><Power size={12} />Turn off spending</button></div>
            </motion.div>
          )}
          </AnimatePresence>
        </section>

        {connected && config && mandateHistory.length > 0 && <section className="flow-history" aria-label="Saved previous limits and payment receipts">
          <strong>Previous limits & receipts</strong>
          <p>These are historical records. Checking them never starts a new purchase.</p>
          {mandateHistory.map((record) => <HistoricalWalletReceipt key={record.id} record={record} config={config} />)}
        </section>}

        <div className="flow-under-card">
          <span><ShieldCheck size={14} />2-of-3 governed MandateRegistry V2</span>
          <a href={config?.mandateRegistryId ? `${stepOneExplorer}/contract/${config.mandateRegistryId}` : "#"} target="_blank" rel="noreferrer">View contract <ArrowUpRight size={13} /></a>
        </div>
      </section>}

      {resultVisible && completedPurchase && config && (
        <div className="wallet-result-view" ref={resultViewRef} tabIndex={-1} aria-label="Service result">
          <div className="wallet-result-toolbar">
            <button type="button" onClick={() => {
              setOpenedResultTx(null);
              window.scrollTo({ top: 0, behavior: "instant" });
            }}><ArrowLeft size={16} />Back to payment trail</button>
            <span>Saved output · Viewing and downloading do not make another payment.</span>
          </div>
          <PurchaseReport
            result={completedPurchase}
            explorerNetwork={config.explorerNetwork}
            registryId={config.mandateRegistryId}
            registrationTx={stored?.registrationTx}
            allowanceTx={stored?.allowanceTx}
            autoScroll={false}
          />
        </div>
      )}

      {disconnectOpen && session.authenticated && (
        <div className="flow-modal-backdrop" role="presentation">
          <section className="flow-modal" role="dialog" aria-modal="true" aria-labelledby="flow-disconnect-title">
            <button className="flow-modal-close" type="button" onClick={() => setDisconnectOpen(false)} disabled={phase === "revoking" || disconnecting} aria-label="Close"><X size={16} /></button>
            <Power size={20} />
            {phase === "revoking" || disconnecting ? (
              <>
                <h2 id="flow-disconnect-title">{disconnecting ? "Disconnecting wallet" : "Turning off spending"}</h2>
                <p role="status" aria-live="polite">{disconnecting
                  ? "Spending is confirmed off. Closing your session and returning to Connect…"
                  : revocationProgress === "wallet"
                    ? "Confirm the transaction in Freighter. This dialog will close automatically after Stellar confirms the revocation."
                    : "Checking the mandate on Stellar. We will disconnect automatically when spending is confirmed off."}</p>
                <button className="flow-primary" type="button" disabled><LoaderCircle className="spin" size={16} />{disconnecting ? "Disconnecting…" : revocationProgress === "wallet" ? "Waiting for Freighter…" : "Confirming on Stellar…"}</button>
              </>
            ) : mandateOnline ? (
              <>
                <h2 id="flow-disconnect-title">Turn off spending first</h2>
                <p>This revokes the mandate on Mainnet. Confirm once in Freighter; after Stellar confirms, we will disconnect automatically and return you to Connect.</p>
                <button className="flow-primary flow-danger" type="button" onClick={() => revoke(true)}><Power size={16} />{stored?.revokeTx || stored?.pendingRevokeTx ? "Check confirmation and disconnect" : "Turn off spending & disconnect"}</button>
              </>
            ) : (
              <>
                <h2 id="flow-disconnect-title">Disconnect wallet</h2>
                <p>Spending is off. This clears the saved setup from this browser; it does not delete wallet history.</p>
                {stored?.revokeTx && <a className="flow-proof-link" href={`${explorer}/tx/${stored.revokeTx}`} target="_blank" rel="noreferrer"><span><Check size={12} />Spending turned off</span><code>{short(stored.revokeTx, 6)}</code><ArrowUpRight size={12} /></a>}
                <button className="flow-primary" type="button" onClick={disconnect} disabled={disconnecting}><Power size={16} />{disconnecting ? "Disconnecting…" : "Disconnect wallet"}</button>
              </>
            )}
          </section>
        </div>
      )}

      <WalletToast notification={notification} busy={notificationBusy} onDismiss={() => setNotification(null)} />
    </main>
  );
}
