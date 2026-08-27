"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { ArrowUp, ArrowUpRight, Bot, Check, CircleDollarSign, Copy, LoaderCircle, TriangleAlert, UserRound } from "lucide-react";
import type { MarketBrief } from "@/lib/wallet/market-brief";

const PurchaseCompleteContext = createContext<(result: PurchaseResult) => void>(() => undefined);

export function AssistantThread({ mandateId, asset, explorerNetwork, onPurchaseComplete }: { mandateId: string; asset: string; explorerNetwork: "testnet" | "public"; onPurchaseComplete: (result: PurchaseResult) => void }) {
  const transport = useMemo(() => new AssistantChatTransport({
    api: "/api/wallet/chat",
    body: { mandateId },
    credentials: "same-origin",
  }), [mandateId]);
  const runtime = useChatRuntime({ transport });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <PurchaseCompleteContext.Provider value={onPurchaseComplete}>
        <ThreadPrimitive.Root className="thread-root">
          <ThreadPrimitive.Viewport className="thread-viewport">
            <QuickPurchase mandateId={mandateId} explorerNetwork={explorerNetwork} />
            <ThreadPrimitive.Empty>
              <div className="chat-empty">
                <div className="agent-orb"><Bot size={22} /></div>
                <p className="eyebrow success">READY TO BUY</p>
                <h3>This is your optional buying assistant.</h3>
                <p>The green button above is the fastest way to buy. Or tell the agent what you want here.</p>
                <div className="chat-prompt"><span>Try typing</span><strong>Buy the research brief</strong><small>Then press the arrow to send.</small></div>
              </div>
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages
              components={{ UserMessage, AssistantMessage }}
            />
            <div className="composer-wrap">
              <ComposerPrimitive.Root className="composer-root">
                <ComposerPrimitive.Input
                  aria-label="Message the Ackrate agent"
                  className="composer-input"
                  placeholder='Type "Buy the research brief"…'
                />
                <ComposerPrimitive.Send className="composer-send" aria-label="Send message">
                  <ArrowUp size={17} />
                </ComposerPrimitive.Send>
              </ComposerPrimitive.Root>
              <p><CircleDollarSign size={12} /> Payments use {asset}. Ackrate checks your limit every time.</p>
            </div>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </PurchaseCompleteContext.Provider>
    </AssistantRuntimeProvider>
  );
}

function QuickPurchase({ mandateId, explorerNetwork }: { mandateId: string; explorerNetwork: "testnet" | "public" }) {
  const [state, setState] = useState<"checking" | "check_failed" | "idle" | "running" | "recovering" | "recovery" | "success" | "error">("checking");
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [recovery, setRecovery] = useState<PendingRecovery | null>(null);
  const [error, setError] = useState<string | null>(null);
  usePublishPurchase(result);

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
      const pendingRecovery = parseRecovery(body.recovery);
      if (pendingRecovery) {
        setRecovery(pendingRecovery);
        const paidResult = isPurchaseResult(pendingRecovery.result)
          ? pendingRecovery.result
          : await openPaidReport(mandateId);
        setResult(paidResult);
        setRecovery(null);
        setState("success");
        setError(null);
        window.dispatchEvent(new Event("ackrate-mandate-updated"));
        if (isPurchaseResult(pendingRecovery.result)) {
          void openPaidReport(mandateId).catch(() => undefined);
        }
      } else {
        setRecovery(null);
        setState("idle");
      }
    } catch {
      setRecovery(null);
      setState("check_failed");
      setError("We could not check your last payment. Tap Check payment before trying to pay.");
    }
  };

  useEffect(() => {
    void checkRecovery();
  }, [mandateId]);

  const purchase = async () => {
    setState("running");
    setResult(null);
    setRecovery(null);
    setError(null);
    try {
      const response = await fetch("/api/wallet/purchase", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mandateId, sourceId: "market-brief" }),
      });
      const body = await response.json() as { ok: boolean; result?: unknown; error?: string };
      if (!response.ok || !body.ok || !isPurchaseResult(body.result)) {
        throw new Error(body.error ?? `Purchase returned HTTP ${response.status}`);
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
      const budgetReached = /Contract,\s*#6|BudgetExceeded|budget.*(?:exceed|remaining|enough)/i.test(message);
      setError(budgetReached
        ? "You have used this spending limit. No payment was made."
        : "We could not finish. Tap Check payment before trying again.");
      setState("error");
    }
  };

  const recover = async () => {
    setState("recovering");
    setResult(null);
    setError(null);
    try {
      const paidResult = await openPaidReport(mandateId);
      setResult(paidResult);
      setRecovery(null);
      setState("success");
      window.dispatchEvent(new Event("ackrate-mandate-updated"));
    } catch (cause) {
      setError("We could not open your brief. Try again. You will not pay again.");
      setState("recovery");
    }
  };

  return (
    <div className="quick-purchase">
      <div>
        <p className="eyebrow success">YOUR PURCHASE</p>
        <strong>Buy a market report</strong>
        <span>{state === "recovery" || state === "recovering"
          ? "You already paid. Get your report below."
          : "Costs $0.01 USDC. Ackrate checks your limit first."}</span>
      </div>
      <button type="button" onClick={state === "recovery" ? recover : state === "check_failed" ? checkRecovery : purchase} disabled={state === "running" || state === "recovering" || state === "checking"}>
        {state === "running" || state === "recovering" ? <LoaderCircle className="spin" size={15} /> : <CircleDollarSign size={15} />}
        {state === "running" ? "Paying…" : state === "recovering" ? "Opening your report…" : state === "checking" ? "Checking your last payment…" : state === "check_failed" ? "Check payment" : state === "recovery" ? "Get my report — no new charge" : "Pay $0.01 and get the report"}
      </button>
      {error && (
        <div className={state === "recovery" ? "quick-purchase-notice" : "quick-purchase-error"}>
          {state === "recovery" ? <Check size={14} /> : <TriangleAlert size={14} />}
          <span>{error}</span>
        </div>
      )}
      {state === "recovery" && recovery && (
        <div className="quick-purchase-evidence">
          <code>{recovery.txHash.slice(0, 8)}…{recovery.txHash.slice(-8)}</code>
          <a href={`https://stellar.expert/explorer/${explorerNetwork}/tx/${recovery.txHash}`} target="_blank" rel="noreferrer" aria-label="Open settled payment in Stellar Explorer">
            <ArrowUpRight size={12} /> View transaction
          </a>
        </div>
      )}
      {result && <ReportReadyNotice />}
    </div>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="message-row user-message">
      <div className="message-avatar"><UserRound size={15} /></div>
      <div className="message-bubble"><MessagePrimitive.Parts /></div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="message-row assistant-message">
      <div className="message-avatar"><Bot size={15} /></div>
      <div className="message-bubble">
        <MessagePrimitive.Parts components={{ tools: { by_name: { purchase_source: PurchaseTool } } }} />
      </div>
    </MessagePrimitive.Root>
  );
}

export interface PurchaseResult {
  source: { id: string; title: string };
  payment: { status: string; amount: string; asset: string; txHash: string; mandateId: string };
  delivered: unknown;
}

interface PendingRecovery {
  pending: true;
  txHash: string;
  amount?: string;
  asset?: string;
  sourceId?: string;
  sourceTitle?: string;
  result?: unknown;
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
  if (candidate.pending !== true
    || typeof candidate.txHash !== "string"
    || !/^[0-9a-f]{64}$/i.test(candidate.txHash)) {
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
  ) return null;
  const findingsValid = brief.findings.every((finding) => (
    typeof finding?.number === "string" && typeof finding.title === "string" && typeof finding.body === "string"
  ));
  const sourcesValid = brief.sources.every((source) => {
    if (typeof source?.publisher !== "string" || typeof source.title !== "string" || typeof source.url !== "string") return false;
    try { return new URL(source.url).protocol === "https:"; } catch { return false; }
  });
  return findingsValid && sourcesValid ? brief as MarketBrief : null;
}

function PurchaseTool({ result, isError, args }: ToolCallMessagePartProps<{ sourceId?: string }, unknown>) {
  usePublishPurchase(isPurchaseResult(result) ? result : null);
  if (isError) {
    return <div className="tool-card tool-error"><TriangleAlert size={15} /><div><strong>Payment stopped</strong><p>No second payment was made.</p></div></div>;
  }
  if (!isPurchaseResult(result)) {
    return <div className="tool-card"><LoaderCircle className="spin" size={15} /><div><strong>Checking your spending limit</strong><p>{args.sourceId ? "Getting your report ready" : "Getting ready"}</p></div></div>;
  }
  return <ReportReadyNotice />;
}

function usePublishPurchase(result: PurchaseResult | null) {
  const publish = useContext(PurchaseCompleteContext);
  const publishedTx = useRef<string | null>(null);
  useEffect(() => {
    if (!result || publishedTx.current === result.payment.txHash) return;
    publishedTx.current = result.payment.txHash;
    publish(result);
  }, [publish, result]);
}

function ReportReadyNotice() {
  return (
    <a className="report-ready-notice" href="#paid-research-brief">
      <span><Check size={14} /></span>
      <div><strong>Your report is ready</strong><p>It is displayed below this workspace.</p></div>
      <ArrowUpRight size={14} />
    </a>
  );
}

export function PurchaseReport({ result, explorerNetwork, registryId, registrationTx, allowanceTx }: { result: PurchaseResult; explorerNetwork: "testnet" | "public"; registryId: string; registrationTx?: string; allowanceTx?: string }) {
  const [copied, setCopied] = useState(false);
  const brief = parseBrief(result.delivered);
  const briefRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (explorerNetwork !== "public") return;
    localStorage.setItem("ackrate:mainnet:last-payment", JSON.stringify({
      txHash: result.payment.txHash,
      amount: result.payment.amount,
      asset: result.payment.asset,
      recordedAt: new Date().toISOString(),
    }));
    window.dispatchEvent(new Event("ackrate-mainnet-payment"));
  }, [explorerNetwork, result.payment.amount, result.payment.asset, result.payment.txHash]);

  useEffect(() => {
    briefRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result.payment.txHash]);

  if (!brief) return null;

  return (
    <section id="paid-research-brief" className="report-section shell" ref={briefRef} aria-labelledby="research-brief-title">
      <header className="report-section-head">
        <p className="eyebrow success">YOUR PAID RESEARCH</p>
        <h2>Report, payment proof, and sources</h2>
        <p>Everything from this purchase is collected below.</p>
      </header>
      <div className="report-layout">
        <aside className="report-rail report-proof-rail" aria-label="Payment proof">
          <div className="report-rail-heading"><span><Check size={14} /></span><div><small>PAYMENT</small><strong>Complete</strong></div></div>
          <div className="report-amount"><small>Paid on {explorerNetwork === "public" ? "Mainnet" : "Testnet"}</small><strong>{result.payment.amount} <span>{result.payment.asset}</span></strong></div>
          <div className="report-hash"><small>Transaction</small><code>{result.payment.txHash.slice(0, 8)}…{result.payment.txHash.slice(-8)}</code></div>
          <button type="button" className="report-copy" onClick={async () => {
            await navigator.clipboard.writeText(result.payment.txHash);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_500);
          }} aria-label="Copy payment transaction ID">
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy transaction"}
          </button>
          <a className="report-link primary" href={`https://stellar.expert/explorer/${explorerNetwork}/tx/${result.payment.txHash}`} target="_blank" rel="noreferrer" aria-label="Open payment in Stellar Explorer">
            <span>View payment</span><ArrowUpRight size={14} />
          </a>
          {registrationTx && <a className="report-link" href={`https://stellar.expert/explorer/${explorerNetwork}/tx/${registrationTx}`} target="_blank" rel="noreferrer"><span>View spending limit</span><ArrowUpRight size={14} /></a>}
          {allowanceTx && <a className="report-link" href={`https://stellar.expert/explorer/${explorerNetwork}/tx/${allowanceTx}`} target="_blank" rel="noreferrer"><span>View USDC approval</span><ArrowUpRight size={14} /></a>}
          <a className="report-link" href={`https://stellar.expert/explorer/${explorerNetwork}/contract/${registryId}`} target="_blank" rel="noreferrer" aria-label="Open payment contract in Stellar Explorer">
            <span>View payment contract</span><ArrowUpRight size={14} />
          </a>
        </aside>

        <article className="research-brief report-document">
          <header className="brief-header">
            <div className="brief-kicker"><span />{brief.kicker}</div>
            <h2 id="research-brief-title">{brief.title}</h2>
            <p>{brief.subtitle}</p>
            <div className="brief-meta"><span>ACKRATE RESEARCH</span><span>PAID WITH {result.payment.asset}</span><span>VERIFIED ON STELLAR</span></div>
          </header>
          <div className="brief-body">
            <p className="brief-opening">{brief.opening}</p>
            <div className="brief-findings">
              {brief.findings.map((finding) => (
                <section className="brief-finding" key={finding.number}>
                  <span>{finding.number}</span>
                  <div><h3>{finding.title}</h3><p>{finding.body}</p></div>
                </section>
              ))}
            </div>
            <aside className="brief-takeaway"><span>THE TAKEAWAY</span><p>{brief.takeaway}</p></aside>
          </div>
        </article>

        <aside className="report-rail report-source-rail" aria-label="Research sources">
          <div className="report-sources-head"><small>SOURCES</small><strong>Original evidence</strong><p>Open the references used in this report.</p></div>
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
