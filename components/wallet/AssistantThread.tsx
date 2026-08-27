"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { ArrowUp, ArrowUpRight, Bot, Check, CircleDollarSign, Copy, LoaderCircle, TriangleAlert, UserRound } from "lucide-react";

const ExplorerContext = createContext<"testnet" | "public">("testnet");

export function AssistantThread({ mandateId, asset, explorerNetwork }: { mandateId: string; asset: string; explorerNetwork: "testnet" | "public" }) {
  const transport = useMemo(() => new AssistantChatTransport({
    api: "/api/wallet/chat",
    body: { mandateId },
    credentials: "same-origin",
  }), [mandateId]);
  const runtime = useChatRuntime({ transport });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ExplorerContext.Provider value={explorerNetwork}>
      <ThreadPrimitive.Root className="thread-root">
        <ThreadPrimitive.Viewport className="thread-viewport">
          <QuickPurchase mandateId={mandateId} explorerNetwork={explorerNetwork} />
          <ThreadPrimitive.Empty>
            <div className="chat-empty">
              <div className="agent-orb"><Bot size={22} /></div>
              <p className="eyebrow success">MANDATE ONLINE</p>
              <h3>Your agent has boundaries.</h3>
              <p>Ask for a listed source. Every payment is re-checked and consumed atomically by MandateRegistry.</p>
              <div className="chat-prompt">Use the verified purchase control above. Natural-language requests remain available below.</div>
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages
            components={{ UserMessage, AssistantMessage }}
          />
          <div className="composer-wrap">
            <ComposerPrimitive.Root className="composer-root">
              <ComposerPrimitive.Input
                aria-label="Message the ACKRATE agent"
                className="composer-input"
                placeholder="Ask the agent to purchase a source…"
              />
              <ComposerPrimitive.Send className="composer-send" aria-label="Send message">
                <ArrowUp size={17} />
              </ComposerPrimitive.Send>
            </ComposerPrimitive.Root>
            <p><CircleDollarSign size={12} /> Payments settle in {asset}. The contract—not the model—enforces the mandate.</p>
          </div>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
      </ExplorerContext.Provider>
    </AssistantRuntimeProvider>
  );
}

function QuickPurchase({ mandateId, explorerNetwork }: { mandateId: string; explorerNetwork: "testnet" | "public" }) {
  const [state, setState] = useState<"checking" | "idle" | "running" | "recovering" | "recovery" | "success" | "error">("checking");
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkRecovery = async () => {
    try {
      const response = await fetch(`/api/wallet/purchase/recovery?mandateId=${encodeURIComponent(mandateId)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = await response.json() as { ok: boolean; recovery?: { pending?: boolean }; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error ?? `Recovery check returned HTTP ${response.status}`);
      if (body.recovery?.pending) {
        setState("recovery");
        setError("Payment is already on Mainnet. Recover the retained delivery; this does not sign or pay again.");
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  };

  useEffect(() => {
    void checkRecovery();
  }, [mandateId]);

  const purchase = async () => {
    setState("running");
    setResult(null);
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
        setState("recovery");
        setError("Payment is already on Mainnet. Recover the retained delivery; this does not sign or pay again.");
        return;
      }
      const budgetReached = /Contract,\s*#6|BudgetExceeded|budget.*(?:exceed|remaining|enough)/i.test(message);
      setError(budgetReached
        ? "Mandate budget reached. MandateRegistry rejected this purchase before settlement."
        : message);
      setState("error");
    }
  };

  const recover = async () => {
    setState("recovering");
    setResult(null);
    setError(null);
    try {
      const response = await fetch("/api/wallet/purchase/recovery", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mandateId }),
      });
      const body = await response.json() as { ok: boolean; result?: unknown; error?: string };
      if (!response.ok || !body.ok || !isPurchaseResult(body.result)) {
        throw new Error(body.error ?? `Recovery returned HTTP ${response.status}`);
      }
      setResult(body.result);
      setState("success");
      window.dispatchEvent(new Event("ackrate-mandate-updated"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setState("recovery");
    }
  };

  return (
    <div className="quick-purchase">
      <div>
        <p className="eyebrow success">VERIFIED PAYMENT PATH</p>
        <strong>Buy the market signal brief</strong>
        <span>Consumer agent → HTTP 402 → Mainnet USDC → HTTP 200</span>
      </div>
      <button type="button" onClick={state === "recovery" ? recover : purchase} disabled={state === "running" || state === "recovering" || state === "checking"}>
        {state === "running" || state === "recovering" ? <LoaderCircle className="spin" size={15} /> : <CircleDollarSign size={15} />}
        {state === "running" ? "Settling…" : state === "recovering" ? "Recovering delivery…" : state === "checking" ? "Checking settlement…" : state === "recovery" ? "Recover delivery — no charge" : "Pay $0.01 USDC"}
      </button>
      {result && <CompletedPurchase result={result} explorerNetwork={explorerNetwork} />}
      {error && <div className="quick-purchase-error"><TriangleAlert size={14} /><span>{error}</span></div>}
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

interface PurchaseResult {
  source: { id: string; title: string };
  payment: { status: string; amount: string; asset: string; txHash: string; mandateId: string };
  delivered: unknown;
}

function isPurchaseResult(value: unknown): value is PurchaseResult {
  if (typeof value !== "object" || value === null) return false;
  const payment = (value as { payment?: unknown }).payment;
  return typeof payment === "object" && payment !== null && typeof (payment as { txHash?: unknown }).txHash === "string";
}

function PurchaseTool({ result, isError, args }: ToolCallMessagePartProps<{ sourceId?: string }, unknown>) {
  const explorerNetwork = useContext(ExplorerContext);
  if (isError) {
    return <div className="tool-card tool-error"><TriangleAlert size={15} /><div><strong>Payment stopped safely</strong><p>The request failed before a second payment could be issued.</p></div></div>;
  }
  if (!isPurchaseResult(result)) {
    return <div className="tool-card"><LoaderCircle className="spin" size={15} /><div><strong>Checking mandate + settlement</strong><p>{args.sourceId ? `Preparing ${args.sourceId}` : "Preparing allowlisted source"}</p></div></div>;
  }
  return <CompletedPurchase result={result} explorerNetwork={explorerNetwork} />;
}

function CompletedPurchase({ result, explorerNetwork }: { result: PurchaseResult; explorerNetwork: "testnet" | "public" }) {
  const [copied, setCopied] = useState(false);
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

  return (
    <div className="tool-card tool-success">
      <span className="tool-check"><Check size={14} /></span>
      <div className="tool-body">
        <strong>{result.source.title}</strong>
        <p>{result.payment.amount} {result.payment.asset} settled through MandateRegistry</p>
        <code className="tool-hash">{result.payment.txHash.slice(0, 8)}…{result.payment.txHash.slice(-8)}</code>
        <div className="tool-actions">
          <button type="button" onClick={async () => {
            await navigator.clipboard.writeText(result.payment.txHash);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_500);
          }} aria-label="Copy settlement transaction hash">
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy hash"}
          </button>
          <a href={`https://stellar.expert/explorer/${explorerNetwork}/tx/${result.payment.txHash}`} target="_blank" rel="noreferrer" aria-label="Open settlement transaction in Stellar Explorer">
            <ArrowUpRight size={12} /> Explorer
          </a>
        </div>
      </div>
    </div>
  );
}
