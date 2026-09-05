"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AssistantRuntimeProvider, ThreadPrimitive } from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/react-ai-sdk";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleDollarSign,
  Copy,
  LoaderCircle,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { MarketBrief } from "@/lib/wallet/market-brief";
import type { Agent402Evidence, Agent402ToolEvidence } from "@/lib/wallet/marketplace-types";
import { sourceIdForMarketplaceService, WEB_SEARCH_INPUTS, type MarketplaceService } from "@/lib/wallet/marketplace-catalog";
import { initialServiceInputValues, serializedServiceInputs, type ServiceInputValues } from "./ServiceConfigurator";

export interface PurchaseResult {
  source: { id: string; title: string };
  payment: { status: string; amount: string; asset: string; txHash: string; mandateId: string };
  delivered: unknown;
}

/** Lifecycle of the paid request; the world uses it to animate the rail. */
export type ThreadState = "checking" | "idle" | "running" | "recovery" | "recovering" | "success" | "error";

const DEFAULT_SEARCH_SERVICE: MarketplaceService = {
  id: "search",
  name: "Web search",
  description: "Live web search",
  category: "web",
  categoryLabel: "Web",
  method: "GET",
  path: "/api/search",
  price: "0.02",
  docs: "https://agent402.tools/tools/search",
  inputs: WEB_SEARCH_INPUTS,
  schemaSource: "verified-docs",
};

interface PendingRecovery {
  pending: true;
  txHash: string;
  amount?: string;
  asset?: string;
  sourceId?: string;
  sourceTitle?: string;
  result?: unknown;
}

export function AssistantThread({
  mandateId,
  asset,
  price = "0.02",
  service = DEFAULT_SEARCH_SERVICE,
  parameters,
  explorerNetwork,
  marketplaceUrl = "https://agent402.tools/stellar",
  onEditConfiguration,
  onPurchaseComplete,
  onStateChange,
  spentOut = false,
}: {
  mandateId: string;
  asset: string;
  price?: string;
  service?: MarketplaceService;
  parameters?: ServiceInputValues;
  explorerNetwork: "testnet" | "public";
  marketplaceUrl?: string;
  onEditConfiguration?: () => void;
  onPurchaseComplete: (result: PurchaseResult) => void;
  onStateChange?: (state: ThreadState) => void;
  spentOut?: boolean;
}) {
  const transport = useMemo(() => new AssistantChatTransport({
    api: "/api/wallet/chat",
    body: { mandateId },
    credentials: "same-origin",
  }), [mandateId]);
  const runtime = useChatRuntime({ transport });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="thread-root research-thread">
        <ThreadPrimitive.Viewport className="thread-viewport research-viewport">
          <ResearchPurchase
            mandateId={mandateId}
            asset={asset}
            price={price}
            service={service}
            parameters={parameters}
            explorerNetwork={explorerNetwork}
            marketplaceUrl={marketplaceUrl}
            onEditConfiguration={onEditConfiguration}
            onPurchaseComplete={onPurchaseComplete}
            onStateChange={onStateChange}
            spentOut={spentOut}
          />
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function ResearchPurchase({
  mandateId,
  asset,
  price,
  service,
  parameters,
  explorerNetwork,
  marketplaceUrl,
  onEditConfiguration,
  onPurchaseComplete,
  onStateChange,
  spentOut = false,
}: {
  mandateId: string;
  asset: string;
  price: string;
  service: MarketplaceService;
  parameters?: ServiceInputValues;
  explorerNetwork: "testnet" | "public";
  marketplaceUrl: string;
  onEditConfiguration?: () => void;
  onPurchaseComplete: (result: PurchaseResult) => void;
  onStateChange?: (state: ThreadState) => void;
  spentOut?: boolean;
}) {
  const inputValues = parameters ?? initialServiceInputValues(service);
  const [state, setState] = useState<ThreadState>("checking");
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [recovery, setRecovery] = useState<PendingRecovery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const publishedTx = useRef<string | null>(null);
  const primaryField = service.inputs.find((field) => field.required && field.type === "string") ?? service.inputs[0];
  const question = primaryField ? inputValues[primaryField.name] ?? "" : "";

  useEffect(() => {
    onStateChange?.(state);
  }, [onStateChange, state]);

  useEffect(() => {
    if (!result || publishedTx.current === result.payment.txHash) return;
    publishedTx.current = result.payment.txHash;
    onPurchaseComplete(result);
  }, [onPurchaseComplete, result]);

  const checkRecovery = async () => {
    setState("checking");
    setError(null);
    try {
      const response = await fetch(`/api/wallet/purchase/recovery?mandateId=${encodeURIComponent(mandateId)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = await response.json() as { ok: boolean; recovery?: unknown; error?: string };
      if (!response.ok || !body.ok) {
        if (sessionLost(body.error ?? "")) {
          setState("error");
          setError("Your wallet session ended. Connect and verify the wallet again; the saved limit resumes here.");
          return;
        }
        if (/exhausted|expired|revoked/i.test(body.error ?? "")) {
          setState("idle");
          setRecovery(null);
          window.dispatchEvent(new Event("ackrate-mandate-updated"));
          return;
        }
        throw new Error(body.error ?? `Recovery check returned HTTP ${response.status}`);
      }
      const pending = parseRecovery(body.recovery);
      if (!pending) {
        setState("idle");
        setRecovery(null);
        return;
      }
      setRecovery(pending);
      if (isPurchaseResult(pending.result)) {
        setResult(pending.result);
        setState("success");
        window.dispatchEvent(new Event("ackrate-mandate-updated"));
        return;
      }
      setState("recovery");
    } catch {
      setState("error");
      setError("The last-payment check is unavailable. No new payment was sent.");
    }
  };

  useEffect(() => {
    void checkRecovery();
  }, [mandateId]);

  const createReport = async () => {
    const normalized = question.replace(/\s+/g, " ").trim();
    if (!normalized || (service.id === "search" && (normalized.length < 3 || normalized.length > 400))) {
      setError(service.id === "search" ? "Enter a question between 3 and 400 characters." : "Return to Configure and enter the required service input.");
      return;
    }
    const sourceId = sourceIdForMarketplaceService(service);
    if (!sourceId) {
      setError("This marketplace service is not enabled for a live payment in this release.");
      return;
    }
    setState("running");
    setResult(null);
    setRecovery(null);
    setError(null);
    try {
      const submittedParameters = serializedServiceInputs(service, inputValues);
      const response = await fetch("/api/wallet/purchase", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mandateId,
          sourceId,
          question: service.id === "search" ? normalized : undefined,
          parameters: submittedParameters,
        }),
      });
      const body = await response.json() as { ok: boolean; result?: unknown; error?: string };
      if (!response.ok || !body.ok || !isPurchaseResult(body.result)) {
        throw new Error(body.error ?? `Research request returned HTTP ${response.status}`);
      }
      setResult(body.result);
      setState("success");
      window.dispatchEvent(new Event("ackrate-mandate-updated"));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (/retained for recovery|delivery is pending/i.test(message)) {
        await checkRecovery();
        return;
      }
      if (sessionLost(message)) {
        setState("error");
        setError("Your wallet session ended before the request was sent. Connect and verify the wallet again; no payment was made.");
        return;
      }
      window.dispatchEvent(new Event("ackrate-mandate-updated"));
      if (/exhausted|not have enough remaining/i.test(message)) {
        setError("This spending limit is fully spent. Set a new limit to run again. No payment was made.");
      } else if (/review/i.test(message)) {
        setError("A payment response needs verification before any retry. No automatic second payment will be sent.");
      } else if (/Agent402|marketplace/i.test(message)) {
        setError("The marketplace is unavailable. No new marketplace payment was sent.");
      } else if (/Contract,\s*#6|BudgetExceeded|budget.*(?:exceed|remaining|enough)/i.test(message)) {
        setError("This spending limit has no room for another report. No payment was made.");
      } else {
        setError("The report did not finish. Check the existing payment before trying again.");
      }
      setState("error");
    }
  };

  const recover = async () => {
    setState("recovering");
    setError(null);
    try {
      const paidResult = await openPaidReport(mandateId);
      setResult(paidResult);
      setRecovery(null);
      setState("success");
      window.dispatchEvent(new Event("ackrate-mandate-updated"));
    } catch {
      setState("recovery");
      setError("The payment is confirmed. Report recovery did not finish, and no second payment was sent.");
    }
  };

  const busy = state === "checking" || state === "running" || state === "recovering";
  const action = state === "recovery" ? recover : createReport;

  return (
    <div className="research-purchase">
      <div className="marketplace-line">
        <div><span className="status-dot" /><strong>Agent402 · {service.name}</strong><small>Live Stellar x402 seller</small></div>
        <a href={marketplaceUrl} target="_blank" rel="noreferrer">Open marketplace <ArrowUpRight size={13} /></a>
      </div>

      <div className="question-block configured-request">
        <span className="configured-request-label">CONFIGURED REQUEST</span>
        <strong>{question}</strong>
        <div>
          {Object.entries(inputValues).filter(([, value]) => value.trim()).map(([name, value]) => (
            <span key={name}><small>{name}</small><code>{value.length > 80 ? `${value.slice(0, 77)}…` : value}</code></span>
          ))}
        </div>
        {onEditConfiguration && <button type="button" onClick={onEditConfiguration} disabled={busy || state === "recovery"}>Edit inputs</button>}
      </div>

      <div className="payment-path" aria-label="Payment and delivery path">
        <div><ShieldCheck size={16} /><span><small>01</small><strong>Contract checks mandate</strong></span></div>
        <ArrowRight size={14} />
        <div><CircleDollarSign size={16} /><span><small>02</small><strong>Agent pays marketplace</strong></span></div>
        <ArrowRight size={14} />
        <div><Search size={16} /><span><small>03</small><strong>{service.id === "search" ? "Cited report returns" : "Service output returns"}</strong></span></div>
      </div>

      {spentOut && state !== "recovery" && state !== "success" && !busy ? (
        <div className="research-spent" role="status">
          <span><Check size={14} /></span>
          <div><strong>This limit is fully spent.</strong><p>Every payment it allowed has been made. Set a new limit to run again.</p></div>
        </div>
      ) : (
      <button className="research-button" type="button" onClick={action} disabled={busy || (state !== "recovery" && question.trim().length < 3)}>
        {busy ? <LoaderCircle className="spin" size={16} /> : state === "recovery" ? <Check size={16} /> : <Search size={16} />}
        {state === "checking" && "Checking previous payment…"}
        {state === "running" && "Buying evidence and writing report…"}
        {state === "recovering" && "Recovering paid report…"}
        {state === "recovery" && "Recover report — no new charge"}
        {!busy && state !== "recovery" && `Run ${service.name} · ${price} ${asset}`}
      </button>
      )}

      <p className="autonomy-note">No wallet popup is needed for each report. The agent can spend only inside the mandate you already approved.</p>

      {error && (
        <div className="research-error" role="alert">
          <TriangleAlert size={15} /><span>{error}</span>
          {state === "error" && <button type="button" onClick={checkRecovery}>Check payment</button>}
        </div>
      )}

      {state === "recovery" && recovery && (
        <div className="recovery-proof">
          <div><Check size={14} /><span><strong>Contract payment found</strong><code>{shortHash(recovery.txHash)}</code></span></div>
          <a href={`https://stellar.expert/explorer/${explorerNetwork}/tx/${recovery.txHash}`} target="_blank" rel="noreferrer">Verify <ArrowUpRight size={12} /></a>
        </div>
      )}

      {result && <a className="report-ready-notice" href="#paid-service-output"><span><Check size={14} /></span><div><strong>Output ready</strong><p>View the result and both payment proofs below.</p></div><ArrowUpRight size={14} /></a>}
    </div>
  );
}

async function openPaidReport(mandateId: string): Promise<PurchaseResult> {
  const response = await fetch("/api/wallet/purchase/recovery", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mandateId }),
  });
  const body = await response.json() as { ok: boolean; result?: unknown; error?: string };
  if (!response.ok || !body.ok || !isPurchaseResult(body.result)) {
    throw new Error(body.error ?? `Report returned HTTP ${response.status}`);
  }
  return body.result;
}

/** Fired when a wallet API call reports that the verified session is gone. */
export const SESSION_LOST_EVENT = "ackrate-session-lost";

function sessionLost(message: string): boolean {
  if (!/session required|session expired|sign in again/i.test(message)) return false;
  window.dispatchEvent(new Event(SESSION_LOST_EVENT));
  return true;
}

export function parseRecovery(value: unknown): PendingRecovery | null {
  if (typeof value !== "object" || value === null) throw new Error("invalid recovery status");
  const candidate = value as { pending?: unknown; txHash?: unknown };
  if (candidate.pending === false) return null;
  if (candidate.pending !== true || typeof candidate.txHash !== "string" || !/^[0-9a-f]{64}$/i.test(candidate.txHash)) {
    throw new Error("invalid retained settlement evidence");
  }
  return value as PendingRecovery;
}

function isPurchaseResult(value: unknown): value is PurchaseResult {
  if (typeof value !== "object" || value === null) return false;
  const payment = (value as { payment?: unknown }).payment;
  return typeof payment === "object" && payment !== null && typeof (payment as { txHash?: unknown }).txHash === "string";
}

function parseBrief(value: unknown): MarketBrief | null {
  if (typeof value !== "object" || value === null) return null;
  const delivered = value as { brief?: unknown };
  if (typeof delivered.brief !== "object" || delivered.brief === null) return null;
  const brief = delivered.brief as Partial<MarketBrief>;
  if (
    typeof brief.kicker !== "string"
    || typeof brief.title !== "string"
    || typeof brief.subtitle !== "string"
    || typeof brief.opening !== "string"
    || typeof brief.takeaway !== "string"
    || !Array.isArray(brief.findings)
    || !Array.isArray(brief.sources)
    || brief.findings.length === 0
    || brief.sources.length === 0
    || (brief.editorialPasses !== undefined && (!Number.isInteger(brief.editorialPasses) || brief.editorialPasses < 1 || brief.editorialPasses > 2))
  ) return null;
  const findingsValid = brief.findings.every((finding) => typeof finding?.number === "string" && typeof finding.title === "string" && typeof finding.body === "string");
  const sourcesValid = brief.sources.every((source) => {
    if (typeof source?.publisher !== "string" || typeof source.title !== "string" || typeof source.url !== "string") return false;
    try { return new URL(source.url).protocol === "https:"; } catch { return false; }
  });
  return findingsValid && sourcesValid ? brief as MarketBrief : null;
}

function parseMarketplace(value: unknown): Agent402Evidence | Agent402ToolEvidence | null {
  if (typeof value !== "object" || value === null) return null;
  const marketplace = (value as { marketplace?: unknown }).marketplace;
  if (typeof marketplace !== "object" || marketplace === null) return null;
  const evidence = marketplace as Partial<Agent402Evidence>;
  if (
    evidence.discovery?.marketplace !== "Agent402"
    || evidence.settlement?.network !== "stellar:pubnet"
    || typeof evidence.settlement.amount !== "string"
    || typeof evidence.settlement.transaction !== "string"
    || !/^[0-9a-f]{64}$/i.test(evidence.settlement.transaction)
  ) return null;
  return evidence as Agent402Evidence;
}

function parseToolDelivery(value: unknown): { service: Agent402ToolEvidence["service"]; output: unknown } | null {
  if (typeof value !== "object" || value === null) return null;
  const delivered = value as { service?: unknown; toolOutput?: unknown };
  if (typeof delivered.service !== "object" || delivered.service === null || delivered.toolOutput === undefined) return null;
  const service = delivered.service as Partial<Agent402ToolEvidence["service"]>;
  if (
    typeof service.slug !== "string"
    || typeof service.name !== "string"
    || (service.method !== "GET" && service.method !== "POST")
    || typeof service.route !== "string"
  ) return null;
  return { service: service as Agent402ToolEvidence["service"], output: delivered.toolOutput };
}

function shortHash(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

function ProofLink({ label, hash, explorerNetwork }: { label: string; hash: string; explorerNetwork: "testnet" | "public" }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="report-proof-row">
      <span><small>{label}</small><code>{shortHash(hash)}</code></span>
      <button type="button" onClick={async () => {
        await navigator.clipboard.writeText(hash);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1_500);
      }} aria-label={`Copy ${label} transaction hash`}>{copied ? <Check size={12} /> : <Copy size={12} />}</button>
      <a href={`https://stellar.expert/explorer/${explorerNetwork}/tx/${hash}`} target="_blank" rel="noreferrer" aria-label={`Open ${label} in Stellar Explorer`}><ArrowUpRight size={13} /></a>
    </div>
  );
}

export function PurchaseReport({
  result,
  explorerNetwork,
  registryId,
  registrationTx,
  allowanceTx,
}: {
  result: PurchaseResult;
  explorerNetwork: "testnet" | "public";
  registryId: string;
  registrationTx?: string;
  allowanceTx?: string;
}) {
  const brief = parseBrief(result.delivered);
  const marketplace = parseMarketplace(result.delivered);
  const toolDelivery = parseToolDelivery(result.delivered);
  const briefRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (explorerNetwork !== "public") return;
    localStorage.setItem("ackrate:mainnet:last-payment", JSON.stringify({
      contractTx: result.payment.txHash,
      marketplaceTx: marketplace?.settlement.transaction ?? null,
      amount: result.payment.amount,
      asset: result.payment.asset,
      recordedAt: new Date().toISOString(),
    }));
    window.dispatchEvent(new Event("ackrate-mainnet-payment"));
  }, [explorerNetwork, marketplace?.settlement.transaction, result.payment.amount, result.payment.asset, result.payment.txHash]);

  if (!marketplace) return null;

  if (!brief && toolDelivery) {
    const outputRecord = typeof toolDelivery.output === "object" && toolDelivery.output !== null && !Array.isArray(toolDelivery.output)
      ? toolDelivery.output as Record<string, unknown>
      : null;
    const textOutput = typeof outputRecord?.text === "string" ? outputRecord.text : null;
    const download = () => {
      const content = textOutput ?? JSON.stringify(toolDelivery.output, null, 2);
      const blob = new Blob([content], { type: textOutput ? "text/plain;charset=utf-8" : "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${toolDelivery.service.slug}-result.${textOutput ? "txt" : "json"}`;
      link.click();
      URL.revokeObjectURL(url);
    };
    return (
      <section id="paid-service-output" className="report-section shell tool-output-section" ref={briefRef} aria-labelledby="tool-output-title">
        <header className="report-section-head">
          <p className="eyebrow success">SERVICE COMPLETE</p>
          <h2 id="tool-output-title">{toolDelivery.service.name} returned a verified result.</h2>
          <p>The output and both Mainnet payment transactions are available in one receipt.</p>
        </header>
        <div className="tool-output-layout">
          <aside className="report-rail report-proof-rail" aria-label="Payment proof">
            <div className="report-rail-heading"><span><Check size={14} /></span><div><small>PAYMENT TRAIL</small><strong>2 of 2 settled</strong></div></div>
            <div className="report-amount"><small>Contract-enforced price</small><strong>{result.payment.amount} <span>{result.payment.asset}</span></strong></div>
            <ProofLink label="Mandate settlement" hash={result.payment.txHash} explorerNetwork={explorerNetwork} />
            <ProofLink label="Agent402 x402" hash={marketplace.settlement.transaction} explorerNetwork="public" />
            {registrationTx && <ProofLink label="Mandate registration" hash={registrationTx} explorerNetwork={explorerNetwork} />}
            {allowanceTx && <ProofLink label="USDC allowance" hash={allowanceTx} explorerNetwork={explorerNetwork} />}
          </aside>
          <article className="tool-output-document">
            <div className="tool-output-toolbar">
              <span><small>LIVE AGENT402 OUTPUT</small><strong>{toolDelivery.service.method} {toolDelivery.service.route}</strong></span>
              <button type="button" onClick={download}>Download {textOutput ? "text" : "JSON"}</button>
            </div>
            {outputRecord && <div className="tool-output-facts">
              {Object.entries(outputRecord).filter(([key, value]) => key !== "text" && ["string", "number", "boolean"].includes(typeof value)).slice(0, 8).map(([key, value]) => (
                <div key={key}><small>{key}</small><strong>{String(value)}</strong></div>
              ))}
            </div>}
            <pre>{textOutput ?? JSON.stringify(toolDelivery.output, null, 2)}</pre>
          </article>
        </div>
      </section>
    );
  }

  if (!brief || !("count" in marketplace)) return null;

  return (
    <section id="paid-service-output" className="report-section shell" ref={briefRef} aria-labelledby="research-brief-title">
      <header className="report-section-head">
        <p className="eyebrow success">REPORT COMPLETE</p>
        <h2>Research with a complete payment trail.</h2>
        <p>The mandate settlement, marketplace payment, and source evidence are independently inspectable.</p>
      </header>

      <div className="report-layout">
        <aside className="report-rail report-proof-rail" aria-label="Payment proof">
          <div className="report-rail-heading"><span><Check size={14} /></span><div><small>PAYMENT TRAIL</small><strong>2 of 2 settled</strong></div></div>
          <div className="report-amount"><small>Contract-enforced price</small><strong>{result.payment.amount} <span>{result.payment.asset}</span></strong></div>
          <ProofLink label="Mandate settlement" hash={result.payment.txHash} explorerNetwork={explorerNetwork} />
          <ProofLink label="Agent402 x402" hash={marketplace.settlement.transaction} explorerNetwork="public" />
          {registrationTx && <ProofLink label="Mandate registration" hash={registrationTx} explorerNetwork={explorerNetwork} />}
          {allowanceTx && <ProofLink label="USDC allowance" hash={allowanceTx} explorerNetwork={explorerNetwork} />}
          <a className="report-link" href={`https://stellar.expert/explorer/${explorerNetwork}/contract/${registryId}`} target="_blank" rel="noreferrer"><span>MandateRegistry V2</span><ArrowUpRight size={14} /></a>
          <a className="report-link" href={marketplace.discovery.marketplaceUrl} target="_blank" rel="noreferrer"><span>Agent402 marketplace</span><ArrowUpRight size={14} /></a>
          <div className="seller-detail"><small>SELLER</small><strong>{marketplace.discovery.sellerName}</strong><code>{marketplace.settlement.network}</code></div>
        </aside>

        <article className="research-brief report-document">
          <header className="brief-header">
            <div className="brief-kicker"><span />{brief.kicker}</div>
            <h2 id="research-brief-title">{brief.title}</h2>
            <p>{brief.subtitle}</p>
            <div className="brief-meta"><span>LIVE WEB EVIDENCE</span><span>PAID IN {result.payment.asset}</span><span>{brief.editorialPasses === 2 ? "TWO-MODEL REVIEW" : "MODEL REVIEW"}</span><span>VERIFIED ON STELLAR</span></div>
          </header>
          <div className="brief-body">
            <p className="brief-opening">{brief.opening}</p>
            <div className="brief-findings">
              {brief.findings.map((finding) => (
                <section className="brief-finding" key={`${finding.number}:${finding.title}`}>
                  <span>{finding.number}</span>
                  <div><h3>{finding.title}</h3><p>{finding.body}</p></div>
                </section>
              ))}
            </div>
            <aside className="brief-takeaway"><span>THE TAKEAWAY</span><p>{brief.takeaway}</p></aside>
            {brief.methodology && <p className="brief-methodology">Method: {brief.methodology}</p>}
          </div>
        </article>

        <aside className="report-rail report-source-rail" aria-label="Research sources">
          <div className="report-sources-head"><small>SOURCES</small><strong>Purchased evidence</strong><p>{marketplace.count} live search results returned by Agent402.</p></div>
          <ol>
            {brief.sources.map((source, index) => (
              <li key={source.url}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <a href={source.url} target="_blank" rel="noreferrer"><b>{source.publisher}</b><small>{source.title}</small></a>
                <ArrowUpRight size={14} />
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </section>
  );
}
