"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Check, LoaderCircle, Power, TriangleAlert, X } from "lucide-react";
import type { IntentMandate } from "@ackrate/core";
import {
  buildMandate,
  prepareAllowanceTransaction,
  registerWithFreighter,
  revokeWithFreighter,
  submitPreparedAllowanceWithFreighter,
} from "@/lib/wallet/mandate-client";
import type { MandateView, SafeAppConfig, SessionView } from "@/lib/wallet/types";
import { addTokenToFreighter, connectFreighter, freighterSessionState, signFreighterTransaction } from "@/lib/wallet/freighter";
import { sourceIdForMarketplaceService, WEB_SEARCH_INPUTS, type MarketplaceService } from "@/lib/wallet/marketplace-catalog";
import { PurchaseReport, SESSION_LOST_EVENT, type PurchaseResult, type ThreadState } from "./AssistantThread";
import { HallCursor, HallEntry, HallGrain } from "./HallAtmosphere";
import { ProtocolWorld } from "./ProtocolWorld";
import { RouteRail } from "./RouteRail";
import { Drift } from "./stages/motion";
import { initialServiceInputValues, type ServiceInputValues } from "./ServiceConfigurator";
import { ConnectStage } from "./stages/ConnectStage";
import { ConfigureStage } from "./stages/ConfigureStage";
import { LimitStage, LIMIT_CEILING } from "./stages/LimitStage";
import { MarketplaceStage } from "./stages/MarketplaceStage";
import { ProofStage } from "./stages/ProofStage";
import { RunStage } from "./stages/RunStage";
import { formatUnits, ProofLink, short } from "./stages/shared";
import { initialWorldSignals, type WorldSignals, type WorldStage } from "./world/signals";

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
  if (!response.ok || !body.ok) {
    if (/session required|session expired/i.test(body.error ?? "")) window.dispatchEvent(new Event(SESSION_LOST_EVENT));
    throw new Error(body.error ?? `Request failed with HTTP ${response.status}`);
  }
  return body;
}

function storedToIntent(stored: StoredMandate): IntentMandate {
  return {
    ...stored,
    idBuffer: Buffer.from(stored.id, "hex"),
    maxAmount: BigInt(stored.maxAmount),
  };
}

/** Below this width the hall reads as a bottom sheet over the world. */
function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 880px)");
    const apply = () => setCompact(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return compact;
}

const EXPIRY_FRACTION: Record<string, number> = { "30": 0.2, "60": 0.4, "360": 0.7, "1440": 1 };

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
  const [preparedAllowance, setPreparedAllowance] = useState<{ mandateId: string; xdr: string } | null>(null);
  const [allowancePreparing, setAllowancePreparing] = useState(false);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [threadState, setThreadState] = useState<ThreadState>("idle");
  const [worldReady, setWorldReady] = useState(false);
  const compact = useCompactLayout();

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

  /* A verified session outlives Freighter's own connected-apps list. If the
     site was removed there, drop the session so the journey restarts at the
     threshold instead of claiming a wallet that is no longer attached. A
     different account merely selected in Freighter is not a disconnect: the
     verified wallet still signs, so only say so. Saved mandates stay in this
     browser either way. */
  useEffect(() => {
    if (!session.authenticated || !session.address) return;
    let active = true;
    void freighterSessionState(session.address).then(async (state) => {
      if (!active || state === "matches" || state === "unknown") return;
      if (state === "different") {
        setNotice(`Freighter has a different account selected. Switch back to ${short(session.address, 4)} before approving anything.`);
        return;
      }
      try {
        await api("/api/wallet/auth/session", { method: "DELETE", body: "{}" });
      } catch {
        return;
      }
      if (!active) return;
      setSession(emptySession);
      setWalletAddress(null);
      setMandate(null);
      setStored(null);
      setPreparedAllowance(null);
      setCompletedPurchase(null);
      setMarketplaceSelected(false);
      setServiceConfigured(false);
      setPhase("idle");
      setNotice("Freighter is no longer connected to this site. Connect a wallet to start again.");
    });
    return () => { active = false; };
  }, [session.address, session.authenticated]);

  /* Any wallet call that finds the verified session gone sends the journey
     back to the threshold. The saved limit stays in this browser and resumes
     after the wallet verifies again. */
  useEffect(() => {
    const lost = () => {
      setSession((current) => {
        if (!current.authenticated) return current;
        setWalletAddress(null);
        setMandate(null);
        setPreparedAllowance(null);
        setAllowancePreparing(false);
        setCompletedPurchase(null);
        setMarketplaceSelected(false);
        setServiceConfigured(false);
        setPhase("idle");
        setError(null);
        setNotice("Your wallet session ended. Connect and verify the wallet again; your saved limit resumes from there.");
        return emptySession;
      });
    };
    window.addEventListener(SESSION_LOST_EVENT, lost);
    return () => window.removeEventListener(SESSION_LOST_EVENT, lost);
  }, []);

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
    if (
      !config
      || !stored?.registrationTx
      || stored.allowanceTx
      || stored.expiry <= Math.floor(Date.now() / 1_000)
      || preparedAllowance?.mandateId === stored.id
    ) return;
    let active = true;
    setAllowancePreparing(true);
    void prepareAllowanceTransaction(config, storedToIntent(stored))
      .then((xdr) => {
        if (active) setPreparedAllowance({ mandateId: stored.id, xdr });
      })
      .catch((cause) => {
        console.error("USDC allowance preparation failed", cause);
      })
      .finally(() => {
        if (active) setAllowancePreparing(false);
      });
    return () => { active = false; };
  }, [config, preparedAllowance?.mandateId, stored?.allowanceTx, stored?.expiry, stored?.id, stored?.registrationTx]);

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
        setCatalogVersion((version) => version + 1);
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
      setNotice("Limit registered. Preparing the final USDC approval now.");
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
    const intent = storedToIntent(stored);
    let prepared = preparedAllowance?.mandateId === stored.id ? preparedAllowance.xdr : null;
    if (!prepared) {
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
      }
      return;
    }
    setPhase("approving");
    setNotice("Opening Freighter now. Approve the single USDC allowance transaction.");
    try {
      const allowanceTx = await submitPreparedAllowanceWithFreighter(config, intent, prepared);
      const next = { ...stored, allowanceTx };
      saveStored(next);
      setPreparedAllowance(null);
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
    setPreparedAllowance(null);
    setAllowancePreparing(false);
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

  /* ------------------------------------------------------------------ view */
  const connected = session.authenticated && Boolean(session.address);
  /* A limit that has been spent to zero stays on the rail so a paid delivery
     can still be collected; "Set a new limit" forgets it and returns to the gate. */
  const spentOut = Boolean(storedFresh && stored?.allowanceTx && mandateMatchesConfig && mandate?.status === "Exhausted");
  const workflowStep = (!connected ? 1 : !marketplaceSelected ? 2 : !serviceConfigured ? 3 : !activeMandateReady && !spentOut ? 4 : !completedPurchase ? 5 : 6) as WorldStage;
  const budgetNumber = Number(budget);
  const minimumBudget = Number(marketplaceService.price);
  const budgetValid = Number.isFinite(budgetNumber) && budgetNumber >= minimumBudget && budgetNumber > 0;
  const hasEnoughUsdc = Boolean(walletBalances && Number(walletBalances.usdcRaw) >= budgetNumber);
  const canApproveLimit = Boolean(config?.ready && !mandateOnline && budgetValid && walletBalances?.hasUsdcTrustline && hasEnoughUsdc);
  const externalSettlement = completedPurchase ? marketplaceSettlement(completedPurchase) : null;
  const guided = isGuidedResearchService(marketplaceService);
  const requestFill = marketplaceService.inputs.length
    ? marketplaceService.inputs.filter((field) => (serviceInputValues[field.name] ?? "").trim()).length / marketplaceService.inputs.length
    : 0;

  const worldSignals = useMemo<WorldSignals>(() => ({
    ...initialWorldSignals,
    stage: workflowStep,
    connected: Boolean(walletAddress),
    verified: connected,
    catalogVersion,
    serviceChosen: marketplaceSelected,
    catalogFocus: workflowStep === 2 ? marketplaceServices.findIndex((service) => service.id === marketplaceDraft.id) : -1,
    requestFill,
    aperture: budgetValid ? Math.min(1, Math.max(0, (budgetNumber - minimumBudget) / (LIMIT_CEILING - minimumBudget))) : 0.1,
    expiry: EXPIRY_FRACTION[duration] ?? 0.4,
    limitRegistered: Boolean(storedFresh && stored?.registrationTx),
    limitArmed: activeMandateReady,
    running: threadState === "running" || threadState === "recovering",
    settled: Boolean(completedPurchase),
  }), [workflowStep, walletAddress, connected, catalogVersion, marketplaceSelected, marketplaceServices, marketplaceDraft.id, requestFill, budgetValid, budgetNumber, minimumBudget, duration, storedFresh, stored?.registrationTx, activeMandateReady, threadState, completedPurchase]);
  const worldFocus = useMemo(() => (compact ? { x: 0, y: 0.17 } : { x: 0.18, y: 0.02 }), [compact]);

  const reachable = useMemo(() => {
    const stops: number[] = [];
    if (workflowStep === 3 || workflowStep === 4) stops.push(2);
    if (workflowStep === 4 || workflowStep === 5) stops.push(3);
    if (workflowStep === 6) stops.push(5);
    return stops;
  }, [workflowStep]);
  const startNewLimit = () => {
    if (config && session.address) {
      localStorage.removeItem(mandateStorageKey(config, session.address));
    }
    setStored(null);
    setMandate(null);
    setPreparedAllowance(null);
    setCompletedPurchase(null);
    setError(null);
    setNotice("Set a fresh spending limit. The spent one stays on-chain as evidence.");
  };
  const navigate = (target: number) => {
    if (target === 2) changeMarketplaceService();
    else if (target === 3) setServiceConfigured(false);
    else if (target === 5) setCompletedPurchase(null);
  };

  return (
    <main className={`hall spatial-step-${workflowStep}`} data-stage={workflowStep}>
      <ProtocolWorld signals={worldSignals} reducedMotion={Boolean(reduceMotion)} focus={worldFocus} onReady={() => setWorldReady(true)} />
      <HallGrain />
      <HallEntry ready={worldReady} />
      <HallCursor />

      <header className="hall-chrome">
        <Link href="/" className="hall-brand" aria-label="ACKRATE home">ACKRATE</Link>
        <div className="hall-status">
          <span className={`hall-network ${config?.ready ? "is-ready" : ""}`}><i />{config?.networkLabel ?? "Loading Mainnet"}</span>
          {connected && (
            <button className="hall-wallet" type="button" onClick={() => setDisconnectOpen(true)} title="Disconnect wallet">
              <code>{short(session.address, 4)}</code><Power size={11} />
            </button>
          )}
          <Link className="hall-link" href="/wallet/diagnostics">Verification <ArrowUpRight size={12} /></Link>
        </div>
      </header>

      <Drift depth={2} className="route-drift"><RouteRail stage={workflowStep} reachable={reachable} onNavigate={navigate} /></Drift>

      <section className={`flow-shell hall-sheet ${workflowStep === 1 ? "is-hero" : ""}`} aria-live="polite">
        <div className="hall-sheet-scroll">
          <AnimatePresence mode="wait" initial={!reduceMotion}>
            {workflowStep === 1 && (
              <ConnectStage
                key="connect"
                config={config}
                walletAddress={walletAddress}
                authenticating={phase === "authenticating"}
                governanceWalletConnected={governanceWalletConnected}
                onConnect={connect}
                onVerify={authenticate}
              />
            )}
            {workflowStep === 2 && (
              <MarketplaceStage
                key="marketplace"
                sessionAddress={session.address}
                query={marketplaceQuery}
                onQueryChange={setMarketplaceQuery}
                loading={marketplaceLoading}
                services={marketplaceServices}
                catalog={marketplaceCatalog}
                draft={marketplaceDraft}
                onDraftChange={setMarketplaceDraft}
                isRunnable={isRunnableMarketplaceService}
                onChoose={chooseMarketplaceService}
                onDisconnect={() => setDisconnectOpen(true)}
              />
            )}
            {workflowStep === 3 && (
              <ConfigureStage
                key="configure"
                service={marketplaceService}
                values={serviceInputValues}
                executable={isRunnableMarketplaceService(marketplaceService)}
                guided={guided}
                onChange={setServiceInputValues}
                onBack={changeMarketplaceService}
                onContinue={() => {
                  setServiceConfigured(true);
                  setNotice(`${marketplaceService.name} inputs locked. Set the agent's spending limit next.`);
                }}
              />
            )}
            {workflowStep === 4 && (
              <LimitStage
                key="limit"
                service={marketplaceService}
                assetCode={config?.asset.code ?? "USDC"}
                configReady={Boolean(config?.ready)}
                budget={budget}
                onBudgetChange={setBudget}
                duration={duration}
                onDurationChange={setDuration}
                balances={walletBalances}
                balancesLoading={balancesLoading}
                onRefreshBalances={() => void refreshWalletBalances()}
                budgetValid={budgetValid}
                hasEnoughUsdc={hasEnoughUsdc}
                canApproveLimit={canApproveLimit}
                mandateOnline={mandateOnline}
                mandateMatchesConfig={mandateMatchesConfig}
                evidence={storedFresh && stored ? { registrationTx: stored.registrationTx, allowanceTx: stored.allowanceTx, maxAmount: stored.maxAmount, decimals: stored.decimals } : null}
                awaitingAllowance={Boolean(storedFresh && stored?.registrationTx && !stored.allowanceTx)}
                phase={phase}
                allowancePreparing={allowancePreparing}
                usdcReady={usdcReady}
                explorer={explorer}
                onActivate={activate}
                onRetryAllowance={retryAllowance}
                onRevoke={revoke}
                onAddUsdc={addUsdc}
                onChangeService={changeMarketplaceService}
                onDisconnect={() => setDisconnectOpen(true)}
              />
            )}
            {workflowStep === 5 && mandate && config && (
              <RunStage
                spentOut={spentOut}
                onNewLimit={startNewLimit}
                key="run"
                service={marketplaceService}
                mandate={mandate}
                config={config}
                parameters={serviceInputValues}
                remaining={remaining}
                limit={currentMandate && config ? formatUnits(currentMandate.maxAmount, config.asset.decimals) : budget}
                expires={expires}
                registrationTx={stored?.registrationTx}
                allowanceTx={stored?.allowanceTx}
                explorer={explorer}
                onEditConfiguration={() => setServiceConfigured(false)}
                onPurchaseComplete={setCompletedPurchase}
                onThreadState={setThreadState}
                onTurnOff={() => setDisconnectOpen(true)}
              />
            )}
            {workflowStep === 6 && completedPurchase && (
              <ProofStage
                key="proof"
                service={marketplaceService}
                guided={guided}
                purchase={completedPurchase}
                externalSettlement={externalSettlement}
                explorer={explorer}
                onAskAnother={() => setCompletedPurchase(null)}
                onTurnOff={() => setDisconnectOpen(true)}
              />
            )}
          </AnimatePresence>
        </div>
      </section>

      <footer className="hall-foot">
        <span>MandateRegistry V2 · 2-of-3 governed</span>
        <a href={config?.mandateRegistryId ? `${explorer}/contract/${config.mandateRegistryId}` : "#"} target="_blank" rel="noreferrer">View contract <ArrowUpRight size={11} /></a>
        <span className="hall-hint" aria-hidden>Drag to look around</span>
      </footer>

      {completedPurchase && config && (
        <div className="hall-report">
          <PurchaseReport
            result={completedPurchase}
            explorerNetwork={config.explorerNetwork}
            registryId={config.mandateRegistryId}
            registrationTx={stored?.registrationTx}
            allowanceTx={stored?.allowanceTx}
          />
        </div>
      )}

      <AnimatePresence>
        {disconnectOpen && session.authenticated && (
          <motion.div
            key="disconnect"
            className="hall-modal-backdrop"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.25 }}
            onClick={(event) => { if (event.target === event.currentTarget) setDisconnectOpen(false); }}
          >
            <motion.section
              className="hall-modal"
              role="dialog" aria-modal="true"
              aria-labelledby="flow-disconnect-title"
              initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <button className="hall-modal-close" type="button" onClick={() => setDisconnectOpen(false)} aria-label="Close"><X size={15} /></button>
              <p className="stage-kicker"><span>{mandateOnline ? "SPENDING IS ON" : "SPENDING IS OFF"}</span></p>
              {mandateOnline ? (
                <>
                  <h2 id="flow-disconnect-title">First, turn off spending</h2>
                  <p>This revokes the mandate on Mainnet. Freighter will ask you to approve one final transaction; after it confirms, you can disconnect.</p>
                  <button className="flow-primary tone-danger" type="button" onClick={revoke} disabled={phase === "revoking"}>
                    {phase === "revoking" ? <LoaderCircle className="spin" size={16} /> : <X size={16} />}
                    <span>{phase === "revoking" ? "Waiting for Freighter" : "Turn off spending"}</span>
                  </button>
                </>
              ) : (
                <>
                  <h2 id="flow-disconnect-title">Ready to disconnect</h2>
                  <p>Spending is off. This clears the saved setup from this browser; it does not delete wallet history.</p>
                  {stored?.revokeTx && <ProofLink label="Spending turned off" hash={stored.revokeTx} explorer={explorer} />}
                  <button className="flow-primary" type="button" onClick={disconnect}><Power size={16} /><span>Disconnect wallet</span></button>
                </>
              )}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(notice || error) && (
          <motion.div
            key={error ? `error:${error}` : `notice:${notice}`}
            className={`hall-toast ${error ? "is-error" : ""}`}
            role={error ? "alert" : "status"}
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 8 }}
            transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <span>{error ? <TriangleAlert size={14} /> : <Check size={14} />}</span>
            <p>{error ?? notice}</p>
            <button type="button" onClick={() => { setError(null); setNotice(null); }} aria-label="Dismiss"><X size={13} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
