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
  Info,
  LoaderCircle,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { MarketBrief } from "../../lib/wallet/market-brief";
import type { Agent402Evidence, Agent402ToolEvidence } from "../../lib/wallet/marketplace-types";
import { sourceIdForMarketplaceService, WEB_SEARCH_INPUTS, type MarketplaceService } from "../../lib/wallet/marketplace-catalog";
import { initialServiceInputValues, serializedServiceInputs, serviceInputProblem, type ServiceInputValues } from "./ServiceConfigurator";
import { safeWalletError } from "../../lib/wallet/notifications";

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
  deliveryState?: "pending" | "ready" | "reconciliation_required";
  paymentConfirmed?: boolean;
  message?: string;
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
  onBusyChange,
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
  onBusyChange?: (busy: boolean) => void;
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
    if (runtime.thread.getState().isRunning) throw new Error("A service request is already running.");
    if (!canRun) throw new Error("This limit cannot make another payment. Existing receipts remain recoverable.");
    if (!quoteToken) throw new Error("Review the service inputs again to confirm its current price and recipient.");
    setChatError(null);
    submittedRun.current = { sourceId, parameters: submittedParameters, quoteToken, requestId: crypto.randomUUID() };
    onRunStarted?.();
    runtime.thread.append({ role: "user", content: [{ type: "text", text: question }] });
    return submittedRun.current.requestId;
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
            onBusyChange={onBusyChange}
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
  onBusyChange,
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
  onRun: (sourceId: string, parameters: Record<string, unknown>, question: string) => string;
  onBusyChange?: (busy: boolean) => void;
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
  const openedResult = useRef<string | null>(null);
  const onCompleteRef = useRef(onPurchaseComplete);
  onCompleteRef.current = onPurchaseComplete;
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [runProgress, setRunProgress] = useState("starting");
  const [pollDelayed, setPollDelayed] = useState(false);
  const chatStatusRef = useRef({ running: chatRunning, failed: false });
  chatStatusRef.current = { running: chatRunning, failed: Boolean(chatError) || state === "error" };
  const primaryField = service.inputs.find((field) => field.required && field.type === "string") ?? service.inputs[0];
  const question = primaryField ? inputValues[primaryField.name] ?? "" : "";
  const inputProblem = serviceInputProblem(service, inputValues);

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
        setActiveRequestId(null);
        if (openedResult.current !== streamedResult.current.payment.txHash) {
          openedResult.current = streamedResult.current.payment.txHash;
          onCompleteRef.current(streamedResult.current);
        }
      }
      else {
        setState("error");
        setError(safeWalletError(chatError, "The agent did not return a confirmed result. Check the payment below; another payment will not start automatically."));
      }
    }
  }, [chatRunning, messages, mandateId, service, chatError]);

  useEffect(() => {
    if (!chatError || (!activeRun.current && state !== "error")) return;
    activeRun.current = false;
    setState(streamedResult.current ? "success" : "error");
    setError(streamedResult.current
      ? "Your service result is saved. The chat summary was interrupted; open the result below."
      : safeWalletError(chatError, "The agent connection did not finish. Check the payment below; another payment will not start automatically."));
  }, [chatError, state]);

  // Poll this exact Run, never the latest receipt from an earlier request.
  // GET only observes durable state; it cannot submit or retry a payment.
  useEffect(() => {
    if (!activeRequestId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let missingChecks = 0;
    const controller = new AbortController();
    const poll = async () => {
      let finished = false;
      try {
        const response = await fetch(`/api/wallet/purchase/status?mandateId=${encodeURIComponent(mandateId)}&requestId=${encodeURIComponent(activeRequestId)}`, {
          credentials: "same-origin", cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        const body = await response.json() as { ok?: boolean; requestId?: string; stage?: string; reserved?: boolean; result?: unknown; txHash?: string };
        if (cancelled) return;
        if (!response.ok || !body.ok || body.requestId !== activeRequestId || !body.stage) throw new Error("Status is unavailable");
        setPollDelayed(false);
        setRunProgress(body.stage);
        missingChecks = body.reserved === false ? missingChecks + 1 : 0;
        if (missingChecks >= 3 && chatStatusRef.current.failed && !chatStatusRef.current.running) {
          finished = true;
          activeRun.current = false;
          setActiveRequestId(null);
          setState("error");
          setError("The agent connection ended before a service run was recorded. Check payment status before trying again.");
          return;
        }
        if (body.stage === "complete") {
          const paid = purchaseResultForMandate(body.result, mandateId);
          if (!paid || paid.source.id !== sourceIdForMarketplaceService(service)) throw new Error("Result does not match this Run");
          finished = true;
          streamedResult.current = paid;
          activeRun.current = false;
          setResult(paid);
          setRecovery(null);
          setError(null);
          setState("success");
          setActiveRequestId(null);
          window.dispatchEvent(new Event("ackrate-mandate-updated"));
          if (openedResult.current !== paid.payment.txHash) {
            openedResult.current = paid.payment.txHash;
            onCompleteRef.current(paid);
          }
        } else if (body.stage === "review_required" || body.stage === "failed") {
          finished = true;
          activeRun.current = false;
          setActiveRequestId(null);
          if (body.txHash && /^[0-9a-f]{64}$/i.test(body.txHash)) {
            setRecovery({ pending: true, txHash: body.txHash, deliveryState: "reconciliation_required", paymentConfirmed: false });
            setState("recovery");
            setError("The service did not finish. This request's receipt is saved below; no second purchase will be sent automatically.");
          } else {
            setState("error");
            setError("This request did not finish. Check its payment status before trying again.");
          }
        }
      } catch {
        if (!cancelled) setPollDelayed(true);
      } finally {
        if (!cancelled && !finished) timer = setTimeout(poll, 3_000);
      }
    };
    timer = setTimeout(poll, 1_000);
    return () => { cancelled = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [activeRequestId, mandateId, service]);

  const checkRecovery = async () => {
    setState("checking");
    setError(null);
    setResult(null);
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
      if (pending.result !== undefined) {
        const paidResult = purchaseResultForMandate(pending.result, mandateId, pending.txHash);
        if (!paidResult || pending.deliveryState !== "ready" || pending.paymentConfirmed !== true) throw new Error("The saved result does not match this mandate and confirmed payment.");
        setResult(paidResult);
        // The read-only endpoint returns a result here only when no pending
        // receipt remains. Keep it accessible without blocking a new Run.
        setRecovery(null);
        setState("idle");
        window.dispatchEvent(new Event("ackrate-mandate-updated"));
        return;
      }
      setState("recovery");
      if (pending.message) setError(pending.deliveryState === "reconciliation_required"
        ? "This receipt needs operator review. Keep the transaction link below; do not make another payment."
        : "Your existing payment is still being checked. Use the recovery action below; it does not start another purchase.");
    } catch (cause) {
      setState("error");
      setError(safeWalletError(cause, "The last-payment check is unavailable. Check again below; no new payment was sent."));
    }
  };

  useEffect(() => {
    void checkRecovery();
  }, [mandateId]);

  const createReport = async () => {
    if (activeRun.current || chatRunning || state !== "idle" || !canRun) return;
    if (inputProblem) {
      setError(inputProblem);
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
      openedResult.current = null;
      setRunProgress("starting");
      setPollDelayed(false);
      setActiveRequestId(onRun(sourceId, submittedParameters, service.id === "search" ? String(submittedParameters.q) : `Run ${service.name} with the configured inputs.`));
    } catch (cause) {
      activeRun.current = false;
      const message = cause instanceof Error ? cause.message : String(cause);
      if (/retained for recovery|delivery is pending|reconciliation|do not (?:pay|make)/i.test(message)) {
        await checkRecovery();
        return;
      }
      if (/Review the service inputs/i.test(message)) {
        setError("Review the service inputs to refresh its price and seller before continuing.");
      } else if (/review/i.test(message)) {
        setError("A payment response needs verification before any retry. No automatic second payment will be sent.");
      } else if (/Agent402|marketplace/i.test(message)) {
        setError("The marketplace request did not finish. Check the existing payment before retrying.");
      } else if (/Contract,\s*#6|BudgetExceeded|budget.*(?:exceed|remaining|enough)/i.test(message)) {
        setError("This spending limit has no room for another service run. Check the payment before trying again.");
      } else {
        setError(safeWalletError(cause, "The service did not finish. Check the existing payment before trying again."));
      }
      setState("error");
    }
  };

  const recover = async () => {
    if (recovery?.deliveryState === "reconciliation_required") {
      await checkRecovery();
      return;
    }
    setState("recovering");
    setError(null);
    try {
      const paidResult = await openPaidReport(mandateId, recovery?.txHash);
      setResult(paidResult);
      setRecovery(null);
      setState("success");
      window.dispatchEvent(new Event("ackrate-mandate-updated"));
    } catch {
      // Re-read terminal/uncertain status without submitting another recovery or purchase.
      await checkRecovery();
    }
  };

  const busy = Boolean(activeRequestId) || chatRunning || state === "checking" || state === "running" || state === "recovering";
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const reconciliationRequired = recovery?.deliveryState === "reconciliation_required";
  const action = state === "recovery" ? reconciliationRequired ? checkRecovery : recover : state === "error" ? checkRecovery : createReport;

  return (
    <div className="research-purchase">
      <div className="marketplace-line">
        <div><span className="status-dot" /><strong>Agent402 · {service.name}</strong><small>Live Stellar x402 seller</small></div>
        <a href={marketplaceUrl} target="_blank" rel="noreferrer">Open marketplace <ArrowUpRight size={13} /></a>
      </div>

      <div className="question-block configured-request">
        <span className="configured-request-label">CONFIGURED REQUEST</span>
        <strong>{question || service.name}</strong>
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

      {activeRequestId && <div className="run-live-status" role="status" aria-live="polite" aria-atomic="true">
        <strong>{runProgress === "formatting" ? "Formatting your result" : runProgress === "fetching_service" ? "Receiving marketplace output" : runProgress === "checking_payment" ? "Checking payment" : "Starting your service"}</strong>
        <ol>
          <li data-complete={["fetching_service", "formatting", "complete"].includes(runProgress)}>Contract payment</li>
          <li data-complete={["formatting", "complete"].includes(runProgress)}>Marketplace output</li>
          <li data-complete={runProgress === "complete"}>Formatted result</li>
        </ol>
        <p>{pollDelayed ? "The status connection is slow. Checking again automatically; no new purchase is being sent." : "Updates automatically. Your result opens here when it is ready."}</p>
      </div>}

      {state !== "success" && !activeRequestId && <button className="research-button" type="button" onClick={action} disabled={busy || (state === "idle" && (!canRun || Boolean(inputProblem)))}>
        {busy ? <LoaderCircle className="spin" size={16} /> : state === "recovery" ? <Check size={16} /> : <Search size={16} />}
        {state === "checking" && "Checking previous payment…"}
        {state === "running" && (service.id === "search" ? "Buying evidence and writing report…" : `Running ${service.name}…`)}
        {state === "recovering" && "Recovering paid result…"}
        {state === "recovery" && (reconciliationRequired ? "Check receipt status" : "Recover result — no new charge")}
        {state === "error" && "Check payment before retrying"}
        {!busy && state === "idle" && `Run ${service.name} · ${price} ${asset}`}
      </button>}

      {!canRun && <p className="autonomy-note">This limit cannot make another payment. Existing receipts remain recoverable.</p>}
      {state === "idle" && inputProblem && <p className="autonomy-note">{inputProblem} Choose Edit inputs to correct the request.</p>}

      <p className="autonomy-note">One service purchase per Run. The agent can spend only inside the mandate you already approved.</p>

      {messages.length > 0 && <div className="agent-conversation" aria-label="Conversation with your payment agent" aria-live="polite">
        <ThreadPrimitive.Messages>
          {({ message }) => <MessagePrimitive.Root className={`agent-message agent-message-${message.role}`}>
            <small>{message.role === "user" ? "YOU" : "YOUR AGENT"}</small>
            <MessagePrimitive.Parts components={{ Text: ChatText, tools: { by_name: { purchase_source: PurchaseTool }, Fallback: () => null } }} />
          </MessagePrimitive.Root>}
        </ThreadPrimitive.Messages>
      </div>}

      {error && (
        <div className="research-error" role={result ? "status" : "alert"} aria-atomic="true">
          {result ? <Info size={15} /> : <TriangleAlert size={15} />}<span>{error}</span>
        </div>
      )}

      {state === "recovery" && recovery && (
        <div className="recovery-proof">
          <div>{recovery.paymentConfirmed ? <Check size={14} /> : <TriangleAlert size={14} />}<span><strong>{reconciliationRequired ? "Operator review required" : recovery.paymentConfirmed ? "Contract payment found" : "Receipt awaiting verification"}</strong><code>{shortHash(recovery.txHash)}</code>{reconciliationRequired && <small>Keep this receipt for support. A new purchase is blocked; checking status does not charge you.</small>}</span></div>
          <a href={`https://stellar.expert/explorer/${explorerNetwork}/tx/${recovery.txHash}`} target="_blank" rel="noreferrer">Verify <ArrowUpRight size={12} /></a>
        </div>
      )}

      {result && <button type="button" className="report-ready-notice" onClick={() => onPurchaseComplete(result)}><span><Check size={14} /></span><div><strong>{state === "idle" ? "View previous result" : "Open result"}</strong><p>{result.source.title} is saved. View the output and payment proofs without another charge.</p></div><ArrowUpRight size={14} /></button>}
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

async function openPaidReport(mandateId: string, txHash?: string): Promise<PurchaseResult> {
  const response = await fetch("/api/wallet/purchase/recovery", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mandateId }),
  });
  const body = await response.json() as { ok: boolean; result?: unknown; error?: string };
  const paidResult = purchaseResultForMandate(body.result, mandateId, txHash);
  if (!response.ok || !body.ok || !paidResult) {
    throw new Error(body.error ?? `Result recovery returned HTTP ${response.status}`);
  }
  return paidResult;
}

export function parseRecovery(value: unknown): PendingRecovery | null {
  if (typeof value !== "object" || value === null) throw new Error("invalid recovery status");
  const candidate = value as { pending?: unknown; txHash?: unknown; deliveryState?: unknown; paymentConfirmed?: unknown; message?: unknown };
  if (candidate.pending === false) {
    if (candidate.txHash !== undefined || candidate.deliveryState !== undefined || candidate.paymentConfirmed === true) throw new Error("invalid recovery status");
    return null;
  }
  if (candidate.pending !== true || typeof candidate.txHash !== "string" || !/^[0-9a-f]{64}$/i.test(candidate.txHash)) {
    throw new Error("invalid retained settlement evidence");
  }
  if ((candidate.deliveryState !== undefined && !["pending", "ready", "reconciliation_required"].includes(String(candidate.deliveryState)))
    || (candidate.paymentConfirmed !== undefined && typeof candidate.paymentConfirmed !== "boolean")
    || (candidate.message !== undefined && typeof candidate.message !== "string")
    || (candidate.deliveryState === "ready" && candidate.paymentConfirmed !== true)) throw new Error("invalid recovery status");
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

/** Recovery may return an earlier service, but never another mandate's receipt. */
export function purchaseResultForMandate(value: unknown, mandateId: string, txHash?: string): PurchaseResult | null {
  return isPurchaseResult(value) && value.payment.mandateId === mandateId
    && (txHash === undefined || value.payment.txHash === txHash) ? value : null;
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
    || (brief.editorialPasses !== undefined && (!Number.isInteger(brief.editorialPasses) || brief.editorialPasses < 0 || brief.editorialPasses > 2))
  ) return null;
  const findingsValid = brief.findings.every((finding) => typeof finding?.number === "string" && typeof finding.title === "string" && typeof finding.body === "string");
  const sourcesValid = brief.sources.every((source) => {
    if (typeof source?.publisher !== "string" || typeof source.title !== "string" || typeof source.url !== "string") return false;
    try { const url = new URL(source.url); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
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

interface ResultDownload {
  filename: string;
  content: string;
  mimeType: string;
}

export function purchaseResultDownload(result: PurchaseResult, format: "receipt" | "output" | "report"): ResultDownload {
  const filename = result.source.id.replace(/[^a-z0-9_-]/gi, "-").slice(0, 64) || "service";
  const brief = parseBrief(result.delivered);
  if (format === "report" && brief) {
    const marketplace = parseMarketplace(result.delivered);
    const content = [
      `# ${brief.title}`, brief.subtitle, brief.opening,
      ...brief.findings.flatMap((finding) => [`## ${finding.number}. ${finding.title}`, finding.body]),
      "## Takeaway", brief.takeaway,
      "## Sources", ...brief.sources.map((source, index) => `[${index + 1}] ${source.title}\n${source.url}`),
      `Method: ${brief.methodology ?? "Purchased source evidence; editorial method not recorded."}`,
      `Generated: ${brief.generatedAt ?? "Not recorded"}`,
      "## Payment receipt", `Service: ${result.source.title}`, `Amount: ${result.payment.amount} ${result.payment.asset}`,
      `Mandate: ${result.payment.mandateId}`, `Contract transaction: ${result.payment.txHash}`,
      ...(marketplace ? [`Marketplace transaction: ${marketplace.settlement.transaction}`] : []),
    ].join("\n\n");
    return { filename: `${filename}-report.md`, content, mimeType: "text/markdown;charset=utf-8" };
  }
  const tool = format === "output" ? parseToolDelivery(result.delivered) : null;
  if (tool) {
    const text = typeof tool.output === "string" ? tool.output
      : typeof tool.output === "object" && tool.output !== null && "text" in tool.output && typeof tool.output.text === "string" ? tool.output.text : null;
    return text !== null
      ? { filename: `${filename}-result.txt`, content: text, mimeType: "text/plain;charset=utf-8" }
      : { filename: `${filename}-result.json`, content: JSON.stringify(tool.output, null, 2), mimeType: "application/json" };
  }
  return { filename: `${filename}-receipt.json`, content: JSON.stringify(result, null, 2), mimeType: "application/json" };
}

function saveDownload(download: ResultDownload) {
  const url = URL.createObjectURL(new Blob([download.content], { type: download.mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = download.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function CitedText({ text, sources }: { text: string; sources: MarketBrief["sources"] }) {
  return <>{text.split(/(\[\d+\])/).map((part, index) => {
    const citation = /^\[(\d+)\]$/.exec(part);
    const source = citation ? sources[Number(citation[1]) - 1] : undefined;
    return source ? <a key={index} href={source.url} target="_blank" rel="noreferrer" aria-label={`Source ${citation![1]}: ${source.title}`}>{part}</a> : part;
  })}</>;
}

function ProofLink({ label, hash, explorerNetwork }: { label: string; hash: string; explorerNetwork: "testnet" | "public" }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="report-proof-row">
      <span><small>{label}</small><code>{shortHash(hash)}</code></span>
      <button type="button" onClick={async () => {
        try {
          await navigator.clipboard.writeText(hash);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1_500);
        } catch {
          // The explorer link still exposes the full receipt if clipboard access is blocked.
        }
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
  autoScroll = true,
}: {
  result: PurchaseResult;
  explorerNetwork: "testnet" | "public";
  registryId: string;
  registrationTx?: string;
  allowanceTx?: string;
  autoScroll?: boolean;
}) {
  const brief = parseBrief(result.delivered);
  const marketplace = parseMarketplace(result.delivered);
  const toolDelivery = parseToolDelivery(result.delivered);
  const briefRef = useRef<HTMLElement>(null);
  const [downloadNotice, setDownloadNotice] = useState<{ message: string; failed: boolean } | null>(null);
  const downloadResult = (format: "receipt" | "output" | "report") => {
    try {
      const file = purchaseResultDownload(result, format);
      saveDownload(file);
      setDownloadNotice({ message: `Download requested: ${file.filename}. Check your browser's downloads.`, failed: false });
    } catch {
      setDownloadNotice({ message: "The download could not start. Your result is still here; try the download again without rerunning the service.", failed: true });
    }
  };
  const downloadStatus = downloadNotice && <p className="report-download-status" role={downloadNotice.failed ? "alert" : "status"}>{downloadNotice.message}</p>;

  useEffect(() => {
    if (explorerNetwork !== "public") return;
    try {
      localStorage.setItem("ackrate:mainnet:last-payment", JSON.stringify({
        contractTx: result.payment.txHash,
        marketplaceTx: marketplace?.settlement.transaction ?? null,
        amount: result.payment.amount,
        asset: result.payment.asset,
        recordedAt: new Date().toISOString(),
      }));
    } catch {
      // The server receipt remains recoverable when browser storage is unavailable.
    }
    window.dispatchEvent(new Event("ackrate-mainnet-payment"));
  }, [explorerNetwork, marketplace?.settlement.transaction, result.payment.amount, result.payment.asset, result.payment.txHash]);

  useEffect(() => {
    if (autoScroll) briefRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [autoScroll, result.payment.txHash]);

  if (!marketplace || (!brief && !toolDelivery) || (brief && !("count" in marketplace))) {
    return <section id="paid-service-output" className="report-section shell tool-output-section" ref={briefRef} aria-labelledby="saved-output-title">
      <header className="report-section-head">
        <p className="eyebrow">SAVED SERVICE RESPONSE</p>
        <h2 id="saved-output-title">Your result and receipt are available.</h2>
        <p>The formatted view could not read this output. Download the saved response; do not run the service again to recover it.</p>
      </header>
      <div className="tool-output-layout">
        <aside className="report-rail report-proof-rail" aria-label="Payment proof">
          <ProofLink label="Mandate settlement" hash={result.payment.txHash} explorerNetwork={explorerNetwork} />
          {marketplace && <ProofLink label="Agent402 x402" hash={marketplace.settlement.transaction} explorerNetwork="public" />}
          {registrationTx && <ProofLink label="Mandate registration" hash={registrationTx} explorerNetwork={explorerNetwork} />}
          {allowanceTx && <ProofLink label="USDC allowance" hash={allowanceTx} explorerNetwork={explorerNetwork} />}
        </aside>
        <article className="tool-output-document">
          <div className="tool-output-toolbar"><strong>{result.source.title}</strong><button type="button" onClick={() => downloadResult("receipt")}>Download receipt JSON</button></div>
          {downloadStatus}
          <pre>{JSON.stringify(result.delivered, null, 2)}</pre>
        </article>
      </div>
    </section>;
  }

  if (!brief && toolDelivery) {
    const outputRecord = typeof toolDelivery.output === "object" && toolDelivery.output !== null && !Array.isArray(toolDelivery.output)
      ? toolDelivery.output as Record<string, unknown>
      : null;
    const textOutput = typeof toolDelivery.output === "string" ? toolDelivery.output : typeof outputRecord?.text === "string" ? outputRecord.text : null;
    return (
      <section id="paid-service-output" className="report-section shell tool-output-section" ref={briefRef} aria-labelledby="tool-output-title">
        <header className="report-section-head">
          <p className="eyebrow success">SERVICE COMPLETE</p>
          <h2 id="tool-output-title">{toolDelivery.service.name} is ready.</h2>
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
              <button type="button" onClick={() => downloadResult("output")}>Download {textOutput !== null ? "text" : "JSON"}</button>
              <button type="button" onClick={() => downloadResult("receipt")}>Receipt JSON</button>
            </div>
            {downloadStatus}
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
          <div className="tool-output-toolbar">
            <strong>Report &amp; evidence</strong>
            <button type="button" title="Download the report as Markdown (.md)" onClick={() => downloadResult("report")}>Download report</button>
            <button type="button" title="Download the saved payment receipt and service response as JSON" onClick={() => downloadResult("receipt")}>Receipt JSON</button>
          </div>
          {downloadStatus}
          <header className="brief-header">
            <div className="brief-kicker"><span />{brief.kicker}</div>
            <h2 id="research-brief-title">{brief.title}</h2>
            <p>{brief.subtitle}</p>
            <div className="brief-meta"><span>LIVE WEB EVIDENCE</span><span>PAID IN {result.payment.asset}</span><span>{brief.editorialPasses === 2 ? "TWO-MODEL REVIEW" : brief.editorialPasses === 1 ? "MODEL REVIEW" : "SOURCE-ONLY BRIEF"}</span><span>PAYMENT VERIFIED ON STELLAR</span></div>
          </header>
          <div className="brief-body">
            <p className="brief-opening"><CitedText text={brief.opening} sources={brief.sources} /></p>
            <div className="brief-findings">
              {brief.findings.map((finding) => (
                <section className="brief-finding" key={`${finding.number}:${finding.title}`}>
                  <span>{finding.number}</span>
                  <div><h3>{finding.title}</h3><p><CitedText text={finding.body} sources={brief.sources} /></p></div>
                </section>
              ))}
            </div>
            <aside className="brief-takeaway"><span>THE TAKEAWAY</span><p><CitedText text={brief.takeaway} sources={brief.sources} /></p></aside>
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
