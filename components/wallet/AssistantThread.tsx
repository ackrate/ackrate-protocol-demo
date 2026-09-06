"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useAuiState, type TextMessagePartProps, type ToolCallMessagePartProps, type ThreadMessage } from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/react-ai-sdk";
import ReactMarkdown from "react-markdown";
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

interface ConfiguredRun {
  sourceId: string;
  parameters: Record<string, unknown>;
  quoteToken?: string;
  requestId: string;
}

export function AssistantThread({
  mandateId,
  asset,
  price = "0.02",
  service = DEFAULT_SEARCH_SERVICE,
  parameters,
  quoteToken,
  canRun = true,
  explorerNetwork,
  marketplaceUrl = "https://agent402.tools/stellar",
  onRunStarted,
  onEditConfiguration,
  onPurchaseComplete,
}: {
  mandateId: string;
  asset: string;
  price?: string;
  service?: MarketplaceService;
  parameters?: ServiceInputValues;
  quoteToken?: string;
  canRun?: boolean;
  explorerNetwork: "testnet" | "public";
  marketplaceUrl?: string;
  onRunStarted?: () => void;
  onEditConfiguration?: () => void;
  onPurchaseComplete: (result: PurchaseResult) => void;
}) {
  const submittedRun = useRef<ConfiguredRun | null>(null);
  const [chatError, setChatError] = useState<Error | null>(null);
  const transport = useMemo(() => new AssistantChatTransport({
    api: "/api/wallet/chat",
    body: () => {
      if (!submittedRun.current) throw new Error("Choose a service and explicitly run it first.");
      return { mandateId, ...submittedRun.current };
    },
    credentials: "same-origin",
  }), [mandateId]);
  const runtime = useChatRuntime({
    transport,
    sendAutomaticallyWhen: () => false,
    onError: (error) => setChatError(error),
  });

  const runService = (sourceId: string, submittedParameters: Record<string, unknown>, question: string) => {
    if (runtime.thread.getState().isRunning) return;
    if (!canRun) throw new Error("This limit cannot make another payment. Existing receipts remain recoverable.");
    if (!quoteToken) throw new Error("Review the service inputs again to confirm its current price and recipient.");
    setChatError(null);
    submittedRun.current = { sourceId, parameters: submittedParameters, quoteToken, requestId: crypto.randomUUID() };
    onRunStarted?.();
    runtime.thread.append({ role: "user", content: [{ type: "text", text: question }] });
  };

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
            canRun={canRun}
            chatError={chatError}
            onRun={runService}
            explorerNetwork={explorerNetwork}
            marketplaceUrl={marketplaceUrl}
            onEditConfiguration={onEditConfiguration}
            onPurchaseComplete={onPurchaseComplete}
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
  canRun,
  chatError,
  onRun,
  explorerNetwork,
  marketplaceUrl,
  onEditConfiguration,
  onPurchaseComplete,
}: {
  mandateId: string;
  asset: string;
  price: string;
  service: MarketplaceService;
  parameters?: ServiceInputValues;
  canRun: boolean;
  chatError: Error | null;
  onRun: (sourceId: string, parameters: Record<string, unknown>, question: string) => void;
  explorerNetwork: "testnet" | "public";
  marketplaceUrl: string;
  onEditConfiguration?: () => void;
  onPurchaseComplete: (result: PurchaseResult) => void;
}) {
  const inputValues = parameters ?? initialServiceInputValues(service);
  const [state, setState] = useState<"checking" | "idle" | "running" | "recovery" | "recovering" | "success" | "error">("checking");
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [recovery, setRecovery] = useState<PendingRecovery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messages = useAuiState((snapshot) => snapshot.thread.messages);
  const chatRunning = useAuiState((snapshot) => snapshot.thread.isRunning);
  const activeRun = useRef(false);
  const sawStream = useRef(false);
  const streamedResult = useRef<PurchaseResult | null>(null);
  const primaryField = service.inputs.find((field) => field.required && field.type === "string") ?? service.inputs[0];
  const question = primaryField ? inputValues[primaryField.name] ?? "" : "";

  useEffect(() => {
    if (!activeRun.current) return;
    if (chatRunning) sawStream.current = true;
    const purchase = confirmedPurchaseFromMessages(messages, mandateId, sourceIdForMarketplaceService(service));
    if (purchase && streamedResult.current?.payment.txHash !== purchase.payment.txHash) {
      streamedResult.current = purchase;
      setResult(purchase);
      setRecovery(null);
      window.dispatchEvent(new Event("ackrate-mandate-updated"));
    }
    const lastMessage = messages[messages.length - 1];
    const ended = lastMessage?.role === "assistant" && (lastMessage.status.type === "complete" || lastMessage.status.type === "incomplete");
    if (!chatRunning && (sawStream.current || ended)) {
      activeRun.current = false;
      if (streamedResult.current) {
        setState("success");
        if (lastMessage?.role === "assistant" && lastMessage.status.type === "incomplete") setError("Your service result is saved. The chat summary was interrupted; open the result below.");
      }
      else {
        setState("error");
        setError("The agent run did not return a confirmed result. Check the existing payment before trying again. No automatic second payment will be sent.");
      }
    }
  }, [chatRunning, messages, mandateId, service]);

  useEffect(() => {
    if (!chatError || !activeRun.current) return;
    activeRun.current = false;
    setState(streamedResult.current ? "success" : "error");
    setError(streamedResult.current
      ? "Your service result is saved. The chat summary was interrupted; open the result below."
      : "The agent connection did not finish. Check the existing payment before trying again. No automatic second payment will be sent.");
  }, [chatError]);

  const checkRecovery = async () => {
    setState("checking");
    setError(null);
    try {
      const response = await fetch(`/api/wallet/purchase/recovery?mandateId=${encodeURIComponent(mandateId)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = await response.json() as { ok: boolean; recovery?: unknown; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error ?? `Recovery check returned HTTP ${response.status}`);
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
    if (activeRun.current || chatRunning || state !== "idle" || !canRun) return;
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
      activeRun.current = true;
      sawStream.current = false;
      streamedResult.current = null;
      onRun(sourceId, submittedParameters, service.id === "search" ? normalized : `Run ${service.name} for ${normalized}`);
    } catch (cause) {
      activeRun.current = false;
      const message = cause instanceof Error ? cause.message : String(cause);
      if (/retained for recovery|delivery is pending/i.test(message)) {
        await checkRecovery();
        return;
      }
      if (/Review the service inputs/i.test(message)) {
        setError(message);
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

  const busy = chatRunning || state === "checking" || state === "running" || state === "recovering";
  const action = state === "recovery" ? recover : state === "error" ? checkRecovery : createReport;

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

      {state !== "success" && <button className="research-button" type="button" onClick={action} disabled={busy || (state === "idle" && (!canRun || question.trim().length < 3))}>
        {busy ? <LoaderCircle className="spin" size={16} /> : state === "recovery" ? <Check size={16} /> : <Search size={16} />}
        {state === "checking" && "Checking previous payment…"}
        {state === "running" && "Buying evidence and writing report…"}
        {state === "recovering" && "Recovering paid report…"}
        {state === "recovery" && "Recover report — no new charge"}
        {state === "error" && "Check payment before retrying"}
        {!busy && state === "idle" && `Run ${service.name} · ${price} ${asset}`}
      </button>}

      {!canRun && <p className="autonomy-note">This limit cannot make another payment. Existing receipts remain recoverable.</p>}

      <p className="autonomy-note">No wallet popup is needed for each report. The agent can spend only inside the mandate you already approved.</p>

      {messages.length > 0 && <div className="agent-conversation" aria-label="Conversation with your payment agent" aria-live="polite">
        <ThreadPrimitive.Messages>
          {({ message }) => <MessagePrimitive.Root className={`agent-message agent-message-${message.role}`}>
            <small>{message.role === "user" ? "YOU" : "YOUR AGENT"}</small>
            <MessagePrimitive.Parts components={{ Text: ChatText, tools: { by_name: { purchase_source: PurchaseTool }, Fallback: () => null } }} />
          </MessagePrimitive.Root>}
        </ThreadPrimitive.Messages>
      </div>}

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

      {result && <button type="button" className="report-ready-notice" disabled={chatRunning || state === "running"} onClick={() => onPurchaseComplete(result)}><span><Check size={14} /></span><div><strong>Open result</strong><p>{chatRunning ? "The agent is finishing its response…" : "View the service output and both payment proofs."}</p></div><ArrowUpRight size={14} /></button>}
    </div>
  );
}

function ChatText({ text }: TextMessagePartProps) {
  return <div className="agent-message-text"><ReactMarkdown skipHtml components={{ a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a> }}>{text}</ReactMarkdown></div>;
}

function PurchaseTool({ result, isError, status }: ToolCallMessagePartProps) {
  if (isError) return <div className="agent-tool-status"><TriangleAlert size={14} /><span>Service execution needs a payment check before retrying.</span></div>;
  if (isPurchaseResult(result)) return <div className="agent-tool-status"><Check size={14} /><span>Paid {result.payment.amount} {result.payment.asset} · {result.source.title}<code>{shortHash(result.payment.txHash)}</code></span></div>;
  if (result !== undefined && status.type !== "running") return <div className="agent-tool-status"><TriangleAlert size={14} /><span>The service response needs verification. Check the payment before retrying.</span></div>;
  return <div className="agent-tool-status"><LoaderCircle className={status.type === "running" ? "spin" : undefined} size={14} /><span>Checking the mandate and running the selected service…</span></div>;
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
  const candidate = value as { payment?: unknown; source?: unknown };
  if (typeof candidate.payment !== "object" || candidate.payment === null || typeof candidate.source !== "object" || candidate.source === null) return false;
  const payment = candidate.payment as Partial<PurchaseResult["payment"]>;
  const source = candidate.source as Partial<PurchaseResult["source"]>;
  return typeof source.id === "string" && typeof source.title === "string"
    && payment.status === "settled"
    && typeof payment.txHash === "string" && /^[0-9a-f]{64}$/i.test(payment.txHash)
    && typeof payment.mandateId === "string" && /^[0-9a-f]{64}$/i.test(payment.mandateId)
    && typeof payment.amount === "string" && /^\d+(?:\.\d+)?$/.test(payment.amount)
    && typeof payment.asset === "string" && "delivered" in value;
}

/** Only a matching server tool result from the current user turn can complete a run. */
export function confirmedPurchaseFromMessages(
  messages: readonly Pick<ThreadMessage, "role" | "content">[],
  mandateId: string,
  sourceId: string | null,
): PurchaseResult | null {
  if (!sourceId) return null;
  let lastUser = messages.length - 1;
  while (lastUser >= 0 && messages[lastUser]?.role !== "user") lastUser -= 1;
  if (lastUser < 0) return null;
  for (const message of messages.slice(lastUser + 1)) {
    if (message.role !== "assistant") continue;
    for (const part of message.content) {
      if (part.type !== "tool-call" || part.toolName !== "purchase_source" || part.isError || !isPurchaseResult(part.result)) continue;
      if (part.result.payment.mandateId === mandateId && part.result.source.id === sourceId) return part.result;
    }
  }
  return null;
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

  useEffect(() => {
    briefRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result.payment.txHash]);

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
