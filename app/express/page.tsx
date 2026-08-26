"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Circle,
  Code2,
  Copy,
  ExternalLink,
  Loader2,
  Package,
  Play,
  RotateCcw,
  Server,
  ShieldCheck,
  Terminal,
  WalletCards,
} from "lucide-react";
import { contractUrl, txUrl } from "@/lib/explorer";

const SETUP = `npm run agents:testnet`;
const INSTALL_CONSUMER = `npm install @reapp-sdk/core@0.3.2 @stellar/stellar-sdk`;
const MAINNET_REGISTRY = "CDBTG5ZKASFA7LOYUPBOTGKAVX5MJIM4U24BYGX7VX23IHYDAHLQPAGS";
const MAINNET_PAYMENT_KEY = "reapp:mainnet:last-payment";

type MainnetPayment = { txHash: string; amount: string; asset: string; recordedAt: string };

function readMainnetPayment(): MainnetPayment | null {
  try {
    const value = JSON.parse(localStorage.getItem(MAINNET_PAYMENT_KEY) ?? "null") as Partial<MainnetPayment> | null;
    if (!value || !/^[0-9a-f]{64}$/.test(value.txHash ?? "")) return null;
    if (typeof value.amount !== "string" || value.asset !== "USDC" || typeof value.recordedAt !== "string") return null;
    return value as MainnetPayment;
  } catch {
    return null;
  }
}

const consumerExample = (endpointBase = "https://your-endpoint.example/api/express/session/source", merchant = "G...MERCHANT") => `import { DeliveryPendingError, getSettlementReceipt, reapp } from "@reapp-sdk/core";
import { Keypair } from "@stellar/stellar-sdk";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const endpointBase = "${endpointBase.replace(/\/$/, "")}";
const merchant = "${merchant}";
// Add .reapp/ to .gitignore. It contains sensitive payment-proof recovery state.
const receiptFile = resolve(".reapp/pending-receipts.json");
const resultFile = resolve(".reapp/accepted-results.json");
let pendingReceipts = {};
let acceptedResults = {};
try {
  pendingReceipts = JSON.parse(await readFile(receiptFile, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
try {
  acceptedResults = JSON.parse(await readFile(resultFile, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
if (Object.keys(pendingReceipts).length > 0 || Object.keys(acceptedResults).length > 0) {
  throw new Error("Prior payment evidence exists. Refusing to create new keys or pay again; recover the exact retained state first.");
}

const user = Keypair.random();
const agentKey = Keypair.random();
let writeQueue = Promise.resolve();
async function writeDurableJson(filePath, value) {
  const snapshot = JSON.stringify(value, null, 2) + "\\n";
  const operation = writeQueue.then(async () => {
    const directory = dirname(filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const temporary = filePath + "." + process.pid + "." + randomUUID() + ".tmp";
    let handle;
    try {
      handle = await open(temporary, "wx", 0o600);
      await handle.writeFile(snapshot, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, filePath);
      await chmod(filePath, 0o600);
      const directoryHandle = await open(directory, "r");
      try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
    } finally {
      await handle?.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  });
  writeQueue = operation.catch(() => undefined);
  await operation;
}
async function persistReceipts() {
  await writeDurableJson(receiptFile, pendingReceipts);
}
const receiptStore = {
  async savePending(receipt) {
    pendingReceipts[receipt.receiptId] = receipt;
    await persistReceipts();
  },
  async clearPending(receiptId) {
    delete pendingReceipts[receiptId];
    await persistReceipts();
  },
  async listPending() {
    return Object.values(pendingReceipts);
  },
};

async function fund(keypair) {
  const response = await fetch(
    "https://friendbot.stellar.org/?addr=" + keypair.publicKey(),
  );
  if (!response.ok) throw new Error("Friendbot funding failed");
}

await Promise.all([fund(user), fund(agentKey)]);
await new Promise((resolve) => setTimeout(resolve, 3000));

const mandate = reapp.createIntentMandate({
  user: user.publicKey(),
  agent: agentKey.publicKey(),
  merchant,
  asset: reapp.testnet.nativeSac,
  maxAmount: "3.00",
  expiry: Math.floor(Date.now() / 1000) + 3600,
});

const registerTx = await reapp.registerMandate(mandate, { signer: user });
const approveTx = await reapp.approveBudget(mandate, { signer: user });
console.log("mandate ready", { registerTx, approveTx });

const agent = reapp.agent({
  mandate,
  signer: agentKey,
  proofPolicy: "bound-v2-only",
  receiptStore,
});
const resources = ["market", "academic", "news", "patents"];
const delivered = [];
let rejected = 0;

for (const [index, resource] of resources.entries()) {
  try {
    let response;
    try {
      response = await agent.fetch(endpointBase + "/" + resource);
    } catch (error) {
      if (!(error instanceof DeliveryPendingError)) throw error;
      console.log("broadcast may have been attempted; retrying the exact receipt", error.receipt.txHash);
      response = await agent.retryDelivery(error.receipt);
    }
    const body = await response.json();
    if (index === 3) throw new Error("The fourth request unexpectedly succeeded");
    if (
      response.status !== 200
      || body.ok !== true
      || typeof body.settledTx !== "string"
      || typeof body.data !== "string"
    ) {
      throw new Error(resource + " returned an invalid protected response");
    }
    const receipt = getSettlementReceipt(response);
    if (
      !receipt
      || receipt.proofVersion !== 2
      || body.settledTx.toLowerCase() !== receipt.txHash.toLowerCase()
    ) throw new Error("Missing or mismatched bound-v2 receipt");
    acceptedResults[resource] = {
      url: endpointBase + "/" + resource,
      txHash: body.settledTx,
      data: body.data,
    };
    await writeDurableJson(resultFile, acceptedResults);
    await agent.acknowledgeDelivery(receipt);
    delivered.push(body.settledTx);
    console.log("delivered", { resource, status: response.status, settledTx: body.settledTx });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (index !== 3 || !/(?:Contract,\\s*#6|BudgetExceeded)/.test(message)) throw error;
    const report = await fetch(endpointBase + "/" + resource, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "contract_rejected", mandateId: mandate.id }),
    });
    if (!report.ok) {
      throw new Error("Final on-chain budget verification failed with HTTP " + report.status);
    }
    rejected = 1;
    console.log("contract rejected", { resource, message });
  }
}

if (delivered.length !== 3 || rejected !== 1 || new Set(delivered).size !== 3) {
  throw new Error("Expected three unique deliveries and one contract rejection");
}

console.log("REAPP TESTNET FLOW PASSED", {
  delivered: 3,
  rejected: 1,
  uniqueSettlements: 3,
});`;

const FULFILLMENT = `import {
  InMemoryBoundRedemptionStore,
  createBoundReappPaidJsonRoute,
} from "@reapp-sdk/express-middleware";

const challengeSecret = process.env.REAPP_CHALLENGE_SECRET;
if (!challengeSecret) throw new Error("REAPP_CHALLENGE_SECRET is required");

// Demo only. Use a durable, shared BoundRedemptionStore in production.
const redemptionStore = new InMemoryBoundRedemptionStore();
const paidSource = createBoundReappPaidJsonRoute({
  merchant,
  sourceAccount: merchant,
  audience: "https://api.example", // exact public origin, never Host-derived
  challengeSecret,
  redemptionStore,
  amount: "1.00",
  resource: (request) => request.originalUrl,
}, async ({ request, payment }) => ({
  body: {
    ok: true,
    resource: request.params.id,
    settledTx: payment.txHash,
    data: "protected value",
  },
}));

app.get("/source/:id", paidSource);`;

const FLOW: [string, string][] = [
  ["HTTP 402", "The API authenticates an exact-origin GET challenge"],
  ["Contract", "execute_payment re-checks and consumes the mandate"],
  ["Proof", "The chain-derived mandate agent signs that request and transaction"],
  ["HTTP 200", "Only a verified payment unlocks the resource"],
];

const KNOWN_EVENT_TYPES = new Set([
  "run_start",
  "funding",
  "mandate_ready",
  "fulfillment_start",
  "request",
  "challenge_402",
  "payment_submit",
  "payment_tx",
  "proof_verified",
  "delivery_200",
  "budget",
  "purchase_blocked",
  "result",
  "reset",
  "error",
]);

type ApiErrorCode =
  | "invalid_request"
  | "not_found"
  | "expired"
  | "busy"
  | "rate_limited"
  | "capacity"
  | "failed";

type ResourceSummary = { id: string; label: string; attempt: number };
type ResourceRef = string | ResourceSummary;

type Workspace = {
  endpointBase: string;
  contractId: string;
  mandateId: string;
  user: string;
  agent: string;
  merchant: string;
  budgetXlm: string;
  priceXlm: string;
  registerTx: string;
  approveTx: string;
  nextResource: ResourceSummary;
};

type Budget = { spentXlm: string; remainingXlm: string; limitXlm: string };

type CreateResult = {
  ok: true;
  action: "create";
  sessionId: string;
  expiresAt: string | number;
  workspace: Workspace;
  events: unknown[];
};

type ChallengeResult = {
  ok: true;
  action: "challenge";
  sessionId: string;
  resource: ResourceSummary;
  status: 402;
  body: unknown;
  events: unknown[];
};

type PurchaseResult = {
  ok: true;
  action: "purchase";
  operationId: string;
  outcome: "delivered" | "blocked";
  resource: ResourceSummary;
  txHash?: string;
  explorerUrl?: string;
  data?: unknown;
  reason?: string;
  budget: Budget;
  nextResource: ResourceSummary | null;
  events: unknown[];
};

type ResetResult = {
  ok: true;
  action: "reset";
  sessionId: string;
  events: unknown[];
};

type StatusResult = {
  ok: true;
  action: "status";
  sessionId: string;
  expiresAt: string;
  events: unknown[];
};

type SuccessResult = CreateResult | ChallengeResult | PurchaseResult | ResetResult | StatusResult;
type FailureResult = { ok: false; error: string; code: ApiErrorCode };

type Exchange = {
  request: { method: string; path: string; headers?: Record<string, string>; body?: unknown };
  response: { status: string; label: string; body: unknown };
};

type TrailEvent = {
  id: number;
  type: string;
  label: string;
  detail?: string;
  hash?: string;
  tone: "info" | "ok" | "warn" | "error";
};

type Transaction = { hash: string; label: string };
type Stage = "idle" | "ready" | "challenged" | "delivered" | "blocked";
type ActiveAction = "create" | "challenge" | "purchase" | "reset" | null;

class WorkbenchError extends Error {
  readonly code?: ApiErrorCode;
  readonly status?: number;

  constructor(message: string, code?: ApiErrorCode, status?: number) {
    super(message);
    this.name = "WorkbenchError";
    this.code = code;
    this.status = status;
  }
}

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: "easeOut" as const },
});

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const text = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

const redact = (value: string): string =>
  value
    .replace(/\bS[A-Z2-7]{55}\b/g, "[redacted Stellar secret]")
    .replace(/\b(sk|api[_-]?key|token)_[A-Za-z0-9_-]{16,}\b/gi, "[redacted credential]")
    .slice(0, 900);

function safeForDisplay(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[nested data omitted]";
  if (typeof value === "string") return redact(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => safeForDisplay(item, depth + 1));
  const record = asRecord(value);
  if (!record) return text(value);
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => !/(secret|seed|private|api.?key|token|sessionId|password|authorization)/i.test(key))
      .slice(0, 40)
      .map(([key, item]) => [key, safeForDisplay(item, depth + 1)]),
  );
}

const cleanHash = (value: unknown): string | undefined => {
  const candidate = text(value).trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(candidate) ? candidate : undefined;
};

const short = (value: string, lead = 7, tail = 5) =>
  value ? `${value.slice(0, lead)}…${value.slice(-tail)}` : "";

const xlm = (value: number) => `${value.toFixed(2)} XLM`;

const resourceId = (resource: ResourceRef | null | undefined) =>
  typeof resource === "string" ? resource : resource?.id ?? "";

const resourcePath = (resource: ResourceRef | null | undefined) => {
  const value = resourceId(resource).trim();
  if (!value) return "/source/market";
  return value.startsWith("/") ? value : `/source/${value}`;
};

const endpointResourceUrl = (endpointBase: string | undefined, resource: ResourceRef | null | undefined) => {
  const base = endpointBase?.replace(/\/$/, "") ?? "";
  const id = resourceId(resource).split("/").filter(Boolean).at(-1) || "market";
  return `${base}/${id}`;
};

const formatExpiry = (value: string | number | null) => {
  if (!value) return "ephemeral session";
  const date = new Date(typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? "ephemeral session" : `expires ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

function eventLabel(event: Record<string, unknown>): Omit<TrailEvent, "id"> | null {
  const type = text(event.type);
  if (!KNOWN_EVENT_TYPES.has(type)) return null;

  const hash = cleanHash(event.hash) ?? cleanHash(event.registerTx) ?? cleanHash(event.approveTx);
  const amount = text(event.amountXlm);
  const resource = text(event.resource);
  const reason = redact(text(event.reason || event.message));
  switch (type) {
    case "run_start":
      return { type, label: "Live testnet workspace starting", detail: `${text(event.budgetXlm) || "3.00"} XLM mandate`, tone: "info" };
    case "funding":
      return { type, label: event.state === "ready" ? "Ephemeral testnet accounts funded" : "Funding ephemeral testnet accounts", tone: event.state === "ready" ? "ok" : "info" };
    case "mandate_ready":
      return { type, label: "Mandate registered and allowance approved", detail: `${text(event.budgetXlm) || "3.00"} XLM contract-enforced limit`, hash, tone: "ok" };
    case "fulfillment_start":
      return { type, label: "Express fulfillment API ready", detail: "local one-process demo · no secrets exposed", tone: "ok" };
    case "request":
      return { type, label: `GET ${resourcePath(resource)}`, detail: text(event.label) || `attempt ${text(event.attempt)}`, tone: "info" };
    case "challenge_402":
      return { type, label: "402 Payment Required", detail: `${amount || "1.00"} XLM · authenticated exact-request challenge`, tone: "warn" };
    case "payment_submit":
      return { type, label: "agent.fetch() submitted execute_payment", detail: `${amount || "1.00"} XLM through MandateRegistry`, tone: "info" };
    case "payment_tx":
      return { type, label: "Contract settlement confirmed", detail: resourcePath(resource), hash, tone: "ok" };
    case "proof_verified":
      return { type, label: "Express verified chain evidence + agent signature", detail: event.ledger ? `ledger ${text(event.ledger)}` : undefined, hash, tone: "ok" };
    case "delivery_200":
      return { type, label: "200 OK · protected JSON delivered", detail: text(event.label), hash, tone: "ok" };
    case "budget":
      return { type, label: `Budget · ${text(event.spentXlm)} XLM spent`, detail: `${text(event.remainingXlm)} XLM remaining`, tone: "info" };
    case "purchase_blocked":
      return { type, label: "Contract rejected the fourth purchase", detail: reason || "budget exceeded", tone: "error" };
    case "result":
      return { type, label: "Run evidence complete", detail: `${text(event.served)} served · ${text(event.blocked)} blocked`, tone: "ok" };
    case "reset":
      return { type, label: "Ephemeral workspace reset", tone: "info" };
    case "error":
      return { type, label: "Workbench error", detail: reason || "The live action failed", tone: "error" };
    default:
      return null;
  }
}

export default function ExpressPage() {
  const [mainnetPayment, setMainnetPayment] = useState<MainnetPayment | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | number | null>(null);
  const [nextResource, setNextResource] = useState<ResourceRef | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [phase, setPhase] = useState(0);
  const [blockedAtContract, setBlockedAtContract] = useState(false);
  const [spent, setSpent] = useState(0);
  const [remaining, setRemaining] = useState(3);
  const [budget, setBudget] = useState(3);
  const [price, setPrice] = useState(1);
  const [served, setServed] = useState(0);
  const [blocked, setBlocked] = useState(0);
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [trail, setTrail] = useState<TrailEvent[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState("");
  const [rateLimit, setRateLimit] = useState("");
  const [codeTab, setCodeTab] = useState<"consumer" | "express">("consumer");
  const [copied, setCopied] = useState("");

  const controller = useRef<AbortController | null>(null);
  const eventId = useRef(0);
  const trailEnd = useRef<HTMLDivElement | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const purchaseOperation = useRef<{
    sessionId: string;
    operationId: string;
    expectedAttempt: number;
    expectedResource: string;
  } | null>(null);

  const busy = activeAction !== null;
  const challenged = stage === "challenged";
  const exhausted = stage === "blocked";

  useEffect(() => () => {
    controller.current?.abort();
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);
  useEffect(() => {
    const refresh = () => setMainnetPayment(readMainnetPayment());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("reapp-mainnet-payment", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("reapp-mainnet-payment", refresh);
    };
  }, []);
  useEffect(() => {
    trailEnd.current?.scrollIntoView({ block: "nearest" });
  }, [trail.length]);

  useEffect(() => {
    if (!sessionId || !workspace?.endpointBase) return;
    const statusController = new AbortController();
    let stopped = false;

    const poll = async () => {
      try {
        const response = await fetch("/api/express", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "status", sessionId }),
          signal: statusController.signal,
        });
        if (response.status === 409) return;
        const payload = (await response.json().catch(() => null)) as StatusResult | FailureResult | null;
        if (stopped || !payload) return;
        if (payload.ok === false) {
          if (payload.code === "expired" || payload.code === "not_found") {
            setError(redact(payload.error));
            setWorkspace(null);
            setSessionId("");
          }
          return;
        }
        if (!response.ok || payload.action !== "status") return;
        setExpiresAt(payload.expiresAt);
        appendEvents(payload.events);
        for (const candidate of payload.events) {
          const event = asRecord(candidate);
          if (!event) continue;
          const type = text(event.type);
          const resource = text(event.resource) || "market";
          const path = endpointResourceUrl(workspace.endpointBase, resource);
          if (type === "challenge_402") {
            setStage("challenged");
            setPhase(1);
            setExchange({
              request: { method: "GET", path },
              response: {
                status: "402",
                label: "Payment Required",
                body: { amount: text(event.amountXlm) || "1.00", resource },
              },
            });
          } else if (type === "payment_tx") {
            const hash = cleanHash(event.hash);
            if (hash) addTransaction(hash, `external payment · /source/${resource}`);
            setPhase(2);
          } else if (type === "proof_verified") {
            setPhase(3);
          } else if (type === "delivery_200") {
            const hash = cleanHash(event.hash);
            if (hash) addTransaction(hash, `external delivery · /source/${resource}`);
            setStage("delivered");
            setPhase(4);
            setServed((count) => count + 1);
            setSpent((count) => Math.min(3, count + 1));
            setRemaining((count) => Math.max(0, count - 1));
            setExchange({
              request: {
                method: "GET",
                path,
                headers: { "X-PAYMENT": "[verified settlement proof]" },
              },
              response: {
                status: "200",
                label: "OK · protected resource",
                body: { resource, data: safeForDisplay(event.data), settledTx: hash },
              },
            });
          } else if (type === "purchase_blocked") {
            setStage("blocked");
            setPhase(2);
            setBlockedAtContract(true);
            setBlocked(1);
            setNextResource(null);
            setExchange({
              request: {
                method: "GET",
                path,
                headers: { "X-PAYMENT": "[not created · contract rejected simulation]" },
              },
              response: {
                status: "REJECTED",
                label: "MandateRegistry · budget enforced",
                body: { outcome: "blocked", reason: text(event.reason) || "budget exceeded" },
              },
            });
          } else if (type === "budget") {
            setBudgetState({
              spentXlm: text(event.spentXlm) || "3.00",
              remainingXlm: text(event.remainingXlm) || "0.00",
              limitXlm: text(event.limitXlm) || "3.00",
            });
          }
        }
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          // Polling is best-effort; direct controls surface actionable errors.
        }
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), 1_500);
    return () => {
      stopped = true;
      clearInterval(timer);
      statusController.abort();
    };
  }, [sessionId, workspace?.endpointBase]);

  async function copyValue(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(""), 1_800);
    } catch {
      setError("Clipboard access was unavailable. Select and copy the value manually.");
    }
  }

  function appendEvents(events: unknown[] | undefined) {
    if (!Array.isArray(events)) return;
    const normalized = events
      .map((candidate) => {
        const record = asRecord(candidate);
        const event = record ? eventLabel(record) : null;
        return event ? { id: eventId.current++, ...event } : null;
      })
      .filter((event): event is TrailEvent => event !== null);
    if (normalized.length) setTrail((current) => [...current, ...normalized]);
  }

  function addTransaction(hashValue: unknown, label: string) {
    const hash = cleanHash(hashValue);
    if (!hash) return;
    setTransactions((current) =>
      current.some((transaction) => transaction.hash === hash)
        ? current
        : [...current, { hash, label }],
    );
  }

  function setBudgetState(value: Budget) {
    const nextSpent = Number(value.spentXlm);
    const nextRemaining = Number(value.remainingXlm);
    const nextLimit = Number(value.limitXlm);
    if (Number.isFinite(nextSpent)) setSpent(nextSpent);
    if (Number.isFinite(nextRemaining)) setRemaining(nextRemaining);
    if (Number.isFinite(nextLimit) && nextLimit > 0) setBudget(nextLimit);
  }

  function clearLocal() {
    setWorkspace(null);
    setSessionId("");
    setExpiresAt(null);
    setNextResource(null);
    setStage("idle");
    setPhase(0);
    setBlockedAtContract(false);
    setSpent(0);
    setRemaining(3);
    setBudget(3);
    setPrice(1);
    setServed(0);
    setBlocked(0);
    setExchange(null);
    setTrail([]);
    setTransactions([]);
    setError("");
    setRateLimit("");
    setCopied("");
    purchaseOperation.current = null;
    eventId.current = 0;
  }

  async function post(
    action: "create" | "challenge" | "purchase" | "reset",
    currentSession?: string,
    purchase?: { operationId: string; expectedAttempt: number; expectedResource: string },
  ): Promise<SuccessResult> {
    const body = action === "purchase" && currentSession && purchase
      ? { action, sessionId: currentSession, ...purchase }
      : currentSession
        ? { action, sessionId: currentSession }
        : { action };
    const response = await fetch("/api/express", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.current?.signal,
    });
    const payload = (await response.json().catch(() => null)) as SuccessResult | FailureResult | null;
    if (!payload || typeof payload !== "object") {
      throw new WorkbenchError(`Live runner returned an unreadable response (HTTP ${response.status}).`, "failed", response.status);
    }
    if (!response.ok || payload.ok !== true) {
      const failure = payload as FailureResult;
      throw new WorkbenchError(redact(text(failure.error) || `Live runner returned HTTP ${response.status}.`), failure.code, response.status);
    }
    return payload;
  }

  function showFailure(action: Exclude<ActiveAction, null>, cause: unknown) {
    if (cause instanceof DOMException && cause.name === "AbortError") return;
    const failure = cause instanceof WorkbenchError ? cause : new WorkbenchError(cause instanceof Error ? cause.message : String(cause));
    const message = redact(failure.message || "The live action failed.");
    if (failure.code === "rate_limited" || failure.code === "capacity" || failure.code === "busy") {
      setRateLimit(message);
    } else {
      setError(message);
    }
    if (failure.code === "expired" || failure.code === "not_found") {
      setWorkspace(null);
      setSessionId("");
      setExpiresAt(null);
      setNextResource(null);
      setStage("idle");
      setPhase(0);
      setBlockedAtContract(false);
    }
    setExchange({
      request: { method: "POST", path: "/api/express", body: { action } },
      response: {
        status: failure.status ? String(failure.status) : "ERROR",
        label: failure.code?.replaceAll("_", " ") ?? "request failed",
        body: { ok: false, code: failure.code ?? "failed", error: message },
      },
    });
    setTrail((current) => [
      ...current,
      { id: eventId.current++, type: "error", label: "Live action failed safely", detail: message, tone: "error" },
    ]);
  }

  async function createWorkspace() {
    if (busy) return;
    controller.current?.abort();
    clearLocal();
    const current = new AbortController();
    controller.current = current;
    setActiveAction("create");
    try {
      const result = await post("create");
      if (result.action !== "create") throw new WorkbenchError("Create returned the wrong response shape.", "failed");
      const nextBudget = Number(result.workspace.budgetXlm);
      const nextPrice = Number(result.workspace.priceXlm);
      setWorkspace(result.workspace);
      setSessionId(result.sessionId);
      setExpiresAt(result.expiresAt);
      setNextResource(result.workspace.nextResource);
      setBudget(Number.isFinite(nextBudget) ? nextBudget : 3);
      setRemaining(Number.isFinite(nextBudget) ? nextBudget : 3);
      setPrice(Number.isFinite(nextPrice) ? nextPrice : 1);
      setStage("ready");
      appendEvents(result.events);
      addTransaction(result.workspace.registerTx, "register mandate");
      addTransaction(result.workspace.approveTx, "approve allowance");
      setExchange({
        request: { method: "POST", path: "/api/express", body: { action: "create" } },
        response: { status: "200", label: "workspace ready", body: safeForDisplay(result) },
      });
    } catch (cause) {
      showFailure("create", cause);
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setActiveAction(null);
      }
    }
  }

  async function getChallenge() {
    if (!sessionId || busy || challenged || exhausted) return;
    const current = new AbortController();
    controller.current = current;
    setActiveAction("challenge");
    setError("");
    setRateLimit("");
    setPhase(0);
    setBlockedAtContract(false);
    try {
      const result = await post("challenge", sessionId);
      if (result.action !== "challenge") throw new WorkbenchError("Challenge returned the wrong response shape.", "failed");
      appendEvents(result.events);
      setNextResource(result.resource);
      setStage("challenged");
      setPhase(1);
      setExchange({
        request: { method: "GET", path: endpointResourceUrl(workspace?.endpointBase, result.resource) },
        response: { status: String(result.status), label: "Payment Required", body: safeForDisplay(result.body) },
      });
    } catch (cause) {
      showFailure("challenge", cause);
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setActiveAction(null);
      }
    }
  }

  async function runAgentFetch() {
    if (!sessionId || busy || !challenged || exhausted) return;
    const current = new AbortController();
    controller.current = current;
    setActiveAction("purchase");
    setError("");
    setRateLimit("");
    setPhase(2);
    setBlockedAtContract(false);
    try {
      const expectedResource = resourceId(nextResource);
      const expectedAttempt = typeof nextResource === "string" ? served + 1 : nextResource?.attempt;
      if (!expectedResource || !Number.isInteger(expectedAttempt)) {
        throw new WorkbenchError("The expected purchase resource is unavailable.", "invalid_request");
      }
      let operation = purchaseOperation.current;
      if (
        !operation
        || operation.sessionId !== sessionId
        || operation.expectedAttempt !== expectedAttempt
        || operation.expectedResource !== expectedResource
      ) {
        operation = {
          sessionId,
          operationId: crypto.randomUUID(),
          expectedAttempt: expectedAttempt as number,
          expectedResource,
        };
        purchaseOperation.current = operation;
      }
      const result = await post("purchase", sessionId, operation);
      if (result.action !== "purchase") throw new WorkbenchError("Purchase returned the wrong response shape.", "failed");
      if (result.operationId !== operation.operationId) {
        throw new WorkbenchError("Purchase response operation id did not match the request.", "failed");
      }
      purchaseOperation.current = null;
      appendEvents(result.events);
      setBudgetState(result.budget);
      setNextResource(result.nextResource);
      if (result.outcome === "delivered") {
        setServed((count) => count + 1);
        setStage("delivered");
        setPhase(4);
        addTransaction(result.txHash, `payment · ${resourcePath(result.resource)}`);
        setExchange({
          request: {
            method: "GET",
            path: endpointResourceUrl(workspace?.endpointBase, result.resource),
            headers: { "X-PAYMENT": "[settlement proof generated by agent.fetch()]" },
          },
          response: {
            status: "200",
            label: "OK · protected resource",
            body: safeForDisplay({
              source: result.resource.id,
              label: result.resource.label,
              data: result.data,
              settledTx: result.txHash,
              budget: result.budget,
            }),
          },
        });
      } else {
        setBlocked((count) => count + 1);
        setStage("blocked");
        setPhase(2);
        setBlockedAtContract(true);
        setExchange({
          request: {
            method: "GET",
            path: endpointResourceUrl(workspace?.endpointBase, result.resource),
            headers: { "X-PAYMENT": "[not created · contract rejected settlement]" },
          },
          response: {
            status: "REJECTED",
            label: "MandateRegistry · budget enforced",
            body: safeForDisplay({ outcome: result.outcome, reason: result.reason, budget: result.budget }),
          },
        });
      }
    } catch (cause) {
      showFailure("purchase", cause);
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setActiveAction(null);
      }
    }
  }

  async function resetWorkspace() {
    if (busy) return;
    if (!sessionId) {
      clearLocal();
      return;
    }
    const current = new AbortController();
    controller.current = current;
    setActiveAction("reset");
    setError("");
    setRateLimit("");
    try {
      const result = await post("reset", sessionId);
      if (result.action !== "reset") throw new WorkbenchError("Reset returned the wrong response shape.", "failed");
      clearLocal();
    } catch (cause) {
      showFailure("reset", cause);
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setActiveAction(null);
      }
    }
  }

  const budgetPercent = Math.max(0, Math.min(100, budget > 0 ? (spent / budget) * 100 : 0));
  const consumerCode = consumerExample(workspace?.endpointBase, workspace?.merchant);
  const rawCode = codeTab === "consumer" ? consumerCode : FULFILLMENT;

  return (
    <main className="relative mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="glow" aria-hidden />

      <motion.section {...fade()} className="mx-auto mb-10 max-w-4xl overflow-hidden rounded-3xl border border-emerald-300/20 bg-[#06100d]/90 text-left shadow-[0_24px_90px_-32px_rgba(16,185,129,0.5)]">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Mainnet · Circle USDC
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-emerald-50 sm:text-4xl">Run the $0.01 USDC agent demo.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-emerald-100/60">Freighter authorizes a 0.03 USDC mandate. The consumer calls the reference Express fulfillment path at 0.01 USDC per purchase, and MandateRegistry rejects purchase four.</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <a href={`https://stellar.expert/explorer/public/contract/${MAINNET_REGISTRY}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-black/25 px-3 py-1.5 text-emerald-200 hover:border-emerald-400/40">
                Mainnet contract · {short(MAINNET_REGISTRY)} <ExternalLink className="h-3 w-3" />
              </a>
              {mainnetPayment ? (
                <a href={`https://stellar.expert/explorer/public/tx/${mainnetPayment.txHash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/[0.08] px-3 py-1.5 text-emerald-200 hover:border-emerald-400/50">
                  Sent {mainnetPayment.amount} {mainnetPayment.asset} · {short(mainnetPayment.txHash)} <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-emerald-100/35">Settlement link appears here after payment</span>
              )}
            </div>
          </div>
          <Link href="/wallet" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-6 py-3 text-sm font-black text-[#06241a] shadow-[0_10px_36px_-8px_rgba(52,211,153,0.7)] transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200">
            <WalletCards className="h-4 w-4" /> Run mainnet demo <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </motion.section>

      <motion.header {...fade()} className="mx-auto max-w-4xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-emerald-300/90">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
          TESTNET DEVELOPER SANDBOX
        </div>
        <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl">
          See the <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(52,211,153,0.25)]">402 become a 200</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-emerald-100/70 sm:text-lg">
          Create an ephemeral fulfillment endpoint, take it into your own VS Code project, or inspect the same bound-v2 402 flow with the hosted controls. Every delivered resource has an exact-request agent signature and a verified testnet payment; the fourth purchase is rejected by the contract.
        </p>
        <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <motion.button
            type="button"
            whileHover={busy || workspace ? {} : { scale: 1.025, y: -1 }}
            whileTap={busy || workspace ? {} : { scale: 0.98 }}
            onClick={createWorkspace}
            disabled={busy || Boolean(workspace)}
            className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-6 py-3 text-sm font-black text-[#06241a] shadow-[0_10px_36px_-8px_rgba(52,211,153,0.75)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
          >
            {activeAction === "create" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : workspace ? <Check className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            {activeAction === "create" ? "Creating workspace…" : workspace ? "Workspace ready" : "Create testnet workspace"}
          </motion.button>
          <button
            type="button"
            onClick={resetWorkspace}
            disabled={busy || (!workspace && !exchange && !error && !rateLimit)}
            className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/15 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-emerald-100/75 transition hover:border-emerald-400/35 hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {activeAction === "reset" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
            Reset
          </button>
        </div>
        <p className="mt-3 text-xs text-emerald-100/40">Fresh testnet-only identities · no wallet connection · no secrets shown or stored in this page</p>

        <AnimatePresence>
          {workspace?.endpointBase && (
            <motion.section
              initial={{ opacity: 0, y: 12, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              className="mt-8 overflow-hidden rounded-2xl border border-emerald-400/25 bg-[#07140f]/90 text-left shadow-[0_18px_60px_-28px_rgba(52,211,153,0.65)]"
              aria-labelledby="endpoint-ready-heading"
            >
              <div className="p-4 sm:p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400 text-[#06241a]">
                    <Check className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/60">Your hosted fulfillment surface</div>
                    <h2 id="endpoint-ready-heading" className="mt-1 text-lg font-bold text-emerald-100">API endpoint ready</h2>
                    <p className="mt-1 text-xs leading-relaxed text-emerald-100/50">Use this endpoint from your own app, or continue with the optional hosted consumer below.</p>
                  </div>
                </div>

                <div className="mt-4 flex min-w-0 items-center gap-2 rounded-xl border border-emerald-400/20 bg-black/35 p-2.5 sm:p-3">
                  <code className="min-w-0 flex-1 break-all text-xs text-emerald-200 [overflow-wrap:anywhere]">{workspace.endpointBase.replace(/\/$/, "")}</code>
                  <CopyButton value={workspace.endpointBase.replace(/\/$/, "")} label="Copy API endpoint" copyKey="endpoint" copied={copied} onCopy={copyValue} />
                </div>

                <dl className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <EndpointFact label="Merchant">
                    <div className="flex min-w-0 items-start gap-1.5">
                      <code className="min-w-0 flex-1 break-all text-[10px] text-emerald-100/70 [overflow-wrap:anywhere]">{workspace.merchant}</code>
                      <CopyButton value={workspace.merchant} label="Copy merchant address" copyKey="merchant" copied={copied} onCopy={copyValue} small />
                    </div>
                  </EndpointFact>
                  <EndpointFact label="Price"><span className="font-semibold text-emerald-200">{workspace.priceXlm} XLM</span> per request</EndpointFact>
                  <EndpointFact label="Contract">
                    <a href={contractUrl(workspace.contractId)} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-emerald-300/80 hover:text-emerald-200">
                      <code className="truncate">{short(workspace.contractId)}</code><ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                    </a>
                  </EndpointFact>
                  <EndpointFact label="Workspace"><span className="text-emerald-100/70">{formatExpiry(expiresAt)}</span></EndpointFact>
                </dl>
              </div>

              <div className="border-t border-white/10 bg-black/20 p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 lg:max-w-[43%]">
                    <h3 className="text-sm font-bold text-emerald-100">Use from VS Code</h3>
                    <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-emerald-100/55">
                      <li><span className="mr-1.5 font-mono text-emerald-400">1.</span>Install the consumer SDK in your project.</li>
                      <li><span className="mr-1.5 font-mono text-emerald-400">2.</span>Create and register a mandate for the merchant above with your own local user and agent signers.</li>
                      <li><span className="mr-1.5 font-mono text-emerald-400">3.</span>Call <code className="text-emerald-300">agent.fetch()</code> against the endpoint.</li>
                    </ol>
                    <p className="mt-3 text-[11px] leading-relaxed text-emerald-100/40">Your local project owns the user and agent keys. They are never sent to this page or included in copied code.</p>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <CopyRow value={INSTALL_CONSUMER} copyKey="install" copied={copied} onCopy={copyValue} />
                    <div className="relative min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                      <pre className="max-h-52 max-w-full overflow-auto whitespace-pre p-3 pr-11 font-mono text-[10px] leading-relaxed text-emerald-100/75 sm:text-[11px]"><code>{consumerExample(workspace.endpointBase, workspace.merchant)}</code></pre>
                      <div className="absolute right-2 top-2">
                        <CopyButton value={consumerExample(workspace.endpointBase, workspace.merchant)} label="Copy consumer example" copyKey="consumer-code" copied={copied} onCopy={copyValue} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </motion.header>

      <motion.section {...fade(0.08)} className="relative mt-10 overflow-hidden rounded-3xl border border-emerald-300/15 bg-[#06100d]/80 shadow-[0_24px_90px_-32px_rgba(16,185,129,0.5)] backdrop-blur-xl">
        <div className="border-b border-white/10 bg-white/[0.025] px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${busy ? "animate-pulse bg-sky-400" : workspace ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-white/25"}`} />
                <h2 className="text-sm font-bold tracking-wide text-emerald-100">PAYMENT WORKBENCH</h2>
                <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100/45">
                  {busy ? `${activeAction} running` : workspace ? formatExpiry(expiresAt) : "not created"}
                </span>
              </div>
              {workspace ? (
                <a href={contractUrl(workspace.contractId)} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1.5 text-xs text-emerald-300/75 hover:text-emerald-200">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 truncate">Upgradeable MandateRegistry · {short(workspace.contractId)}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                </a>
              ) : (
                <p className="mt-2 text-xs text-emerald-100/45">The server creates and funds the disposable testnet actors only when you start.</p>
              )}
            </div>

            <div className="grid min-w-0 grid-cols-3 gap-2 text-center sm:min-w-[360px]">
              <Stat label="served" value={served} tone="emerald" />
              <Stat label="blocked" value={blocked} tone={blocked ? "red" : "muted"} />
              <Stat label="price" value={`${price.toFixed(2)} XLM`} tone="muted" compact />
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100/45">Mandate budget</div>
                <div className="mt-1 text-sm font-bold text-emerald-100">{xlm(spent)} <span className="font-normal text-emerald-100/45">of {xlm(budget)}</span></div>
              </div>
              <div className="text-xs text-emerald-100/55">{xlm(remaining)} remaining</div>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-black/45 ring-1 ring-white/10"
              role="progressbar"
              aria-label="Mandate budget spent"
              aria-valuemin={0}
              aria-valuemax={budget}
              aria-valuenow={spent}
              aria-valuetext={`${xlm(spent)} of ${xlm(budget)} spent`}
            >
              <motion.div
                className={`h-full rounded-full ${exhausted ? "bg-gradient-to-r from-emerald-400 via-emerald-300 to-red-400" : "bg-gradient-to-r from-emerald-400 to-teal-300"}`}
                animate={{ width: `${budgetPercent}%` }}
                transition={{ type: "spring", stiffness: 115, damping: 22 }}
              />
            </div>
          </div>
        </div>

        <div className="px-4 py-5 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <StepButton
              number="01"
              title="GET without payment"
              detail={workspace ? resourcePath(nextResource) : "Create the workspace first"}
              onClick={getChallenge}
              disabled={!workspace || busy || challenged || exhausted}
              active={activeAction === "challenge"}
              complete={challenged}
              icon={<Server className="h-4 w-4" aria-hidden />}
            />
            <StepButton
              number="02"
              title="Run hosted consumer"
              detail={challenged ? "Optional: settle, prove, and unlock here" : exhausted ? "Budget exhausted on-chain" : "Inspect the 402 first"}
              onClick={runAgentFetch}
              disabled={!workspace || busy || !challenged || exhausted}
              active={activeAction === "purchase"}
              complete={stage === "delivered"}
              icon={<WalletCards className="h-4 w-4" aria-hidden />}
            />
          </div>

          <Lifecycle phase={phase} active={busy} blocked={blockedAtContract} />

          <AnimatePresence mode="popLayout">
            {(error || rateLimit) && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                role="alert"
                className={`mt-4 flex min-w-0 items-start gap-3 rounded-xl border px-4 py-3 text-sm ${rateLimit ? "border-amber-400/30 bg-amber-400/[0.07] text-amber-100" : "border-red-400/30 bg-red-400/[0.07] text-red-100"}`}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="min-w-0 break-words [overflow-wrap:anywhere]">
                  <div className="font-semibold">{rateLimit ? "Testnet capacity limit" : "Live action stopped safely"}</div>
                  <div className="mt-0.5 text-xs opacity-75">{rateLimit || error}</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <section className="min-w-0 overflow-hidden rounded-2xl glass" aria-labelledby="code-heading">
              <div className="flex min-w-0 items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-3 py-2.5 sm:px-4">
                <div className="flex min-w-0 items-center gap-2">
                  <Code2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                  <h3 id="code-heading" className="truncate text-sm font-semibold text-emerald-100">Implementation</h3>
                </div>
                <div className="flex shrink-0 rounded-lg border border-white/10 bg-black/25 p-0.5" role="tablist" aria-label="Implementation example">
                  {(["consumer", "express"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={codeTab === tab}
                      aria-controls="express-code-panel"
                      onClick={() => setCodeTab(tab)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 ${codeTab === tab ? "bg-emerald-400/15 text-emerald-200" : "text-emerald-100/40 hover:text-emerald-100/75"}`}
                    >
                      {tab === "express" ? "Express" : "Consumer"}
                    </button>
                  ))}
                </div>
              </div>
              <pre id="express-code-panel" role="tabpanel" className="h-[360px] max-w-full overflow-auto whitespace-pre p-4 font-mono text-[11px] leading-relaxed text-emerald-100/80 sm:text-xs">
                <code>{rawCode}</code>
              </pre>
              <div className="border-t border-white/10 px-4 py-3 text-xs leading-relaxed text-emerald-100/50">
                {codeTab === "consumer"
                  ? "Run this one-shot example in a clean project. It fails closed if prior receipt/result evidence exists; recover that exact state before creating another payment context."
                  : "The protected handler runs only after verification and atomic redemption."}
              </div>
            </section>

            <RawConsole exchange={exchange} trail={trail} trailEnd={trailEnd} busy={busy} />
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-100/60">Live transaction evidence</h3>
              <span className="text-[11px] text-emerald-100/35">Stellar testnet · opens in stellar.expert</span>
            </div>
            {transactions.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {transactions.map((transaction) => (
                  <a
                    key={transaction.hash}
                    href={txUrl(transaction.hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1.5 text-xs text-emerald-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
                  >
                    <span className="min-w-0 truncate">{transaction.label}</span>
                    <code className="shrink-0 text-[10px] text-emerald-300/70">{short(transaction.hash)}</code>
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-emerald-100/35">Create a workspace to see the authorization and payment transactions.</p>
            )}
          </div>
        </div>
      </motion.section>

      <div id="implementation" className="mx-auto mt-14 max-w-3xl scroll-mt-24">
        <motion.section {...fade(0.12)}>
          <H>Run both reference agents</H>
          <Code>{SETUP}</Code>
          <p className="mt-3 text-sm leading-relaxed text-emerald-100/60">
            One command creates fresh testnet actors, registers the 3 XLM mandate, starts the 402-gated Express API, serves three paid resources, and proves the fourth purchase cannot exceed the budget.
          </p>
        </motion.section>

        <motion.section {...fade(0.16)} className="mt-9">
          <H>Consumer agent</H>
          <Code>{consumerCode}</Code>
          <p className="mt-3 text-sm leading-relaxed text-emerald-100/60">
            Use this one-shot example in a clean VS Code project, where your user and agent keys stay under your control. It fails closed on retained evidence instead of silently creating new keys; the repository reference agent demonstrates full same-identity restart recovery. The consumer never transfers tokens directly or treats cached budget state as authority; the contract decides whether every spend is allowed.
          </p>
        </motion.section>

        <motion.section {...fade(0.2)} className="mt-9">
          <H>Fulfillment agent</H>
          <Code>{FULFILLMENT}</Code>
          <p className="mt-3 text-sm leading-relaxed text-emerald-100/60">
            The paid JSON route authenticates the challenge, binds the exact origin and GET resource, checks transaction freshness, the MandateRegistry event and matching SEP-41 transfer, then verifies the chain-derived mandate agent signature. One proof atomically claims one callback execution and stores exact JSON bytes; completed recovery replays those bytes without rerunning work. The interactive demo uses a workspace-scoped memory store; production requires a durable shared claim/result store.
          </p>
        </motion.section>

        <motion.section {...fade(0.24)} className="mt-9">
          <H>Request lifecycle</H>
          <div className="overflow-hidden rounded-xl border border-white/10">
            {FLOW.map(([signal, description], index) => (
              <div key={signal} className={`flex min-w-0 flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${index % 2 ? "bg-white/[0.02]" : ""}`}>
                <code className="break-words text-xs text-emerald-300">{signal}</code>
                <span className="min-w-0 break-words text-xs text-emerald-100/60 sm:max-w-[58%] sm:text-right">{description}</span>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section {...fade(0.28)} className="mt-9 rounded-2xl glass p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-emerald-100">Keep the safe boundary</h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-emerald-100/65">
                <li>Never trust the amount, merchant, agent, or mandate claimed in an HTTP header.</li>
                <li>Never serve before independent chain verification and exact-request signature verification.</li>
                <li>Never replace execute_payment with a direct token transfer or cached application check.</li>
              </ul>
            </div>
          </div>
        </motion.section>

        <motion.div {...fade(0.32)} className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a href="https://www.npmjs.com/package/@reapp-sdk/express-middleware" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-[#06241a] hover:bg-emerald-300">
            <Package className="h-4 w-4" aria-hidden /> Express middleware package
          </a>
          <Link href="/cli" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-emerald-100/80 hover:border-emerald-400/40">
            <Terminal className="h-4 w-4" aria-hidden /> Open the CLI
          </Link>
          <a href="https://github.com/reapp-protocol/reapp-protocol/tree/main/apps" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-emerald-100/65 hover:border-emerald-400/40 hover:text-emerald-100">
            Reference source <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </motion.div>
      </div>
    </main>
  );
}

function CopyButton({ value, label, copyKey, copied, onCopy, small = false }: { value: string; label: string; copyKey: string; copied: string; onCopy: (value: string, key: string) => void | Promise<void>; small?: boolean }) {
  const didCopy = copied === copyKey;
  return (
    <button
      type="button"
      onClick={() => void onCopy(value, copyKey)}
      aria-label={didCopy ? `${label}: copied` : label}
      title={didCopy ? "Copied" : label}
      className={`inline-grid shrink-0 place-items-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 ${small ? "h-6 w-6" : "h-8 w-8"} ${didCopy ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300" : "border-white/10 bg-white/[0.04] text-emerald-100/45 hover:border-emerald-400/35 hover:text-emerald-200"}`}
    >
      {didCopy ? <Check className={small ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden /> : <Copy className={small ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />}
    </button>
  );
}

function CopyRow({ value, copyKey, copied, onCopy }: { value: string; copyKey: string; copied: string; onCopy: (value: string, key: string) => void | Promise<void> }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-black/40 p-2.5">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[10px] text-emerald-200/80 sm:text-[11px]">{value}</code>
      <CopyButton value={value} label="Copy install command" copyKey={copyKey} copied={copied} onCopy={onCopy} />
    </div>
  );
}

function EndpointFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/8 bg-white/[0.025] p-3">
      <dt className="text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-100/35">{label}</dt>
      <dd className="mt-1 min-w-0 break-words text-[11px] text-emerald-100/60 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function Stat({ label, value, tone, compact = false }: { label: string; value: string | number; tone: "emerald" | "red" | "muted"; compact?: boolean }) {
  const color = tone === "emerald" ? "text-emerald-300" : tone === "red" ? "text-red-300" : "text-emerald-100/70";
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/25 px-2 py-2.5">
      <div className={`${compact ? "text-sm" : "text-xl"} truncate font-black tabular-nums ${color}`}>{value}</div>
      <div className="mt-0.5 truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-100/35">{label}</div>
    </div>
  );
}

function StepButton({ number, title, detail, onClick, disabled, active, complete, icon }: { number: string; title: string; detail: string; onClick: () => void; disabled: boolean; active: boolean; complete: boolean; icon: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      whileHover={disabled ? {} : { y: -2 }}
      whileTap={disabled ? {} : { scale: 0.99 }}
      onClick={onClick}
      disabled={disabled}
      className={`group min-w-0 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 disabled:cursor-not-allowed ${active ? "border-sky-400/40 bg-sky-400/[0.08]" : complete ? "border-emerald-400/35 bg-emerald-400/[0.07]" : disabled ? "border-white/8 bg-white/[0.018] opacity-50" : "border-emerald-400/25 bg-emerald-400/[0.045] hover:border-emerald-400/45 hover:bg-emerald-400/[0.075]"}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active ? "bg-sky-400/15 text-sky-300" : complete ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.05] text-emerald-100/55"}`}>
          {active ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : complete ? <Check className="h-4 w-4" aria-hidden /> : icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 font-mono text-[10px] text-emerald-100/30">{number}</span>
            <span className="min-w-0 break-words text-sm font-bold text-emerald-100 [overflow-wrap:anywhere]">{title}</span>
          </div>
          <p className="mt-1 min-w-0 break-words text-xs text-emerald-100/45 [overflow-wrap:anywhere]">{detail}</p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-emerald-100/25 transition group-hover:translate-x-0.5 group-hover:text-emerald-300" aria-hidden />
      </div>
    </motion.button>
  );
}

function Lifecycle({ phase, active, blocked }: { phase: number; active: boolean; blocked: boolean }) {
  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4" aria-label="Request lifecycle">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-100/60">Request lifecycle</h3>
        <code className="text-[10px] text-emerald-300/60">402 → contract → proof → 200</code>
      </div>
      <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FLOW.map(([label], index) => {
          const step = index + 1;
          const complete = phase >= step;
          const isBlocked = blocked && step === 2;
          const current = active && phase === step;
          return (
            <li key={label} className={`min-w-0 rounded-xl border px-3 py-2.5 ${isBlocked ? "border-red-400/35 bg-red-400/[0.07]" : complete ? "border-emerald-400/30 bg-emerald-400/[0.06]" : current ? "border-sky-400/30 bg-sky-400/[0.06]" : "border-white/8 bg-white/[0.018]"}`}>
              <div className="flex min-w-0 items-center gap-2">
                {isBlocked ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-300" aria-hidden /> : complete ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden /> : current ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-300" aria-hidden /> : <Circle className="h-3.5 w-3.5 shrink-0 text-white/20" aria-hidden />}
                <span className={`min-w-0 truncate text-[11px] font-semibold ${isBlocked ? "text-red-200" : complete ? "text-emerald-200" : current ? "text-sky-200" : "text-emerald-100/35"}`}>{label}</span>
              </div>
              {isBlocked && <div className="mt-1 break-words text-[9px] text-red-200/60">budget exceeded</div>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function RawConsole({ exchange, trail, trailEnd, busy }: { exchange: Exchange | null; trail: TrailEvent[]; trailEnd: React.RefObject<HTMLDivElement | null>; busy: boolean }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-emerald-400/20 bg-black shadow-[0_10px_44px_-18px_rgba(16,185,129,0.35)]" aria-labelledby="raw-console-heading">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-white/10 bg-white/[0.035] px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex shrink-0 gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          </span>
          <h3 id="raw-console-heading" className="ml-1 min-w-0 truncate text-sm font-semibold text-emerald-100">Raw request / response</h3>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-emerald-100/40">
          <span className={`h-1.5 w-1.5 rounded-full ${busy ? "animate-pulse bg-sky-400" : "bg-emerald-400/60"}`} />
          {busy ? "waiting on testnet" : "live"}
        </span>
      </div>

      <div className="h-[360px] max-w-full overflow-y-auto p-3 font-mono text-[10px] leading-relaxed sm:p-4 sm:text-[11px]" role="log" aria-live="polite" aria-relevant="additions">
        {!exchange ? (
          <div className="grid h-full place-items-center px-5 text-center text-emerald-100/30">
            <div>
              <Terminal className="mx-auto h-7 w-7 text-emerald-400/35" aria-hidden />
              <p className="mt-3">Create a workspace, then stage the unpaid and paid requests here.</p>
            </div>
          </div>
        ) : (
          <div className="min-w-0 space-y-4">
            <div className="min-w-0">
              <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-sky-300/60">Request</div>
              <div className="flex min-w-0 items-start gap-2 rounded-lg border border-sky-400/15 bg-sky-400/[0.04] px-3 py-2">
                <span className="shrink-0 font-bold text-sky-300">{exchange.request.method}</span>
                <span className="min-w-0 break-all text-emerald-100/75">{exchange.request.path}</span>
              </div>
              {exchange.request.headers && (
                <pre className="mt-2 max-w-full whitespace-pre-wrap break-words rounded-lg bg-white/[0.025] px-3 py-2 text-emerald-100/55 [overflow-wrap:anywhere]">{JSON.stringify(exchange.request.headers, null, 2)}</pre>
              )}
              {exchange.request.body !== undefined && (
                <pre className="mt-2 max-w-full whitespace-pre-wrap break-words rounded-lg bg-white/[0.025] px-3 py-2 text-emerald-100/55 [overflow-wrap:anywhere]">{JSON.stringify(safeForDisplay(exchange.request.body), null, 2)}</pre>
              )}
            </div>

            <div className="min-w-0 border-t border-white/10 pt-4">
              <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-300/60">Response</span>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${exchange.response.status === "200" ? "bg-emerald-400/15 text-emerald-300" : exchange.response.status === "402" ? "bg-amber-400/15 text-amber-300" : exchange.response.status === "REJECTED" || exchange.response.status === "ERROR" ? "bg-red-400/15 text-red-300" : "bg-white/10 text-emerald-100/60"}`}>{exchange.response.status}</span>
                <span className="min-w-0 break-words text-emerald-100/45 [overflow-wrap:anywhere]">{exchange.response.label}</span>
              </div>
              <pre className="max-w-full whitespace-pre-wrap break-words rounded-lg border border-emerald-400/10 bg-emerald-400/[0.035] px-3 py-2.5 text-emerald-100/75 [overflow-wrap:anywhere]">{JSON.stringify(safeForDisplay(exchange.response.body), null, 2)}</pre>
            </div>

            {trail.length > 0 && (
              <div className="min-w-0 border-t border-white/10 pt-4">
                <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-100/35">Server event trail</div>
                <div className="space-y-1.5">
                  <AnimatePresence initial={false}>
                    {trail.map((event) => (
                      <motion.div key={event.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex min-w-0 items-start gap-2 rounded-md px-1 py-1">
                        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${event.tone === "ok" ? "bg-emerald-400" : event.tone === "warn" ? "bg-amber-400" : event.tone === "error" ? "bg-red-400" : "bg-sky-400"}`} />
                        <div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                          <span className="text-emerald-100/70">{event.label}</span>
                          {event.detail && <span className="text-emerald-100/35"> · {event.detail}</span>}
                        </div>
                        {event.hash && (
                          <a href={txUrl(event.hash)} target="_blank" rel="noreferrer" className="shrink-0 text-emerald-400/75 hover:text-emerald-300" aria-label={`Open transaction for ${event.label}`}>
                            tx ↗
                          </a>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <div ref={trailEnd} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-lg font-semibold text-emerald-100">{children}</h2>;
}

function Code({ children }: { children: string }) {
  return (
    <pre className="max-w-full overflow-x-auto rounded-xl glass bg-black/25 p-4 text-xs leading-relaxed text-emerald-100/90">
      <code>{children}</code>
    </pre>
  );
}
