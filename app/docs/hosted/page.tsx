"use client";
import CodeBlock from "@/components/CodeBlock";
import { useEffect, useMemo, useRef, useState } from "react";
import { txUrl, contractUrl } from "@/lib/explorer";
const STORAGE_KEY = "ackrate-hackathon-workspace-v1";
type ResourceSummary = { id: string; label: string; attempt: number };
type Workspace = {
  endpointBase: string;
  contractId: string;
  merchant: string;
  budgetXlm: string;
  priceXlm: string;
  nextResource: ResourceSummary;
};
type PersistedWorkspace = { sessionId: string; expiresAt: string; workspace: Workspace };
type DemoEvent = Record<string, unknown> & { type: string };
type CreateResponse = {
  ok: true;
  action: "create";
  sessionId: string;
  expiresAt: string;
  workspace: Workspace;
  events: DemoEvent[];
};
type StatusResponse = {
  ok: true;
  action: "status";
  sessionId: string;
  expiresAt: string;
  events: DemoEvent[];
};
type FailureResponse = { ok: false; code?: string; error?: string };

const valueText = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

const hashValue = (value: unknown): string | null => {
  const candidate = valueText(value).toLowerCase();
  return /^[0-9a-f]{64}$/.test(candidate) ? candidate : null;
};

const isWorkspace = (value: unknown): value is PersistedWorkspace => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as PersistedWorkspace;
  return /^[0-9a-f-]{36}$/i.test(candidate.sessionId)
    && typeof candidate.expiresAt === "string"
    && typeof candidate.workspace?.endpointBase === "string"
    && /^https?:\/\//.test(candidate.workspace.endpointBase)
    && /^G[A-Z2-7]{55}$/.test(candidate.workspace.merchant)
    && /^C[A-Z2-7]{55}$/.test(candidate.workspace.contractId);
};

export default function HostedWalkthrough() {
  const [persisted, setPersisted] = useState<PersistedWorkspace | null>(null);
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (isWorkspace(parsed)) setPersisted(parsed);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  useEffect(() => {
    if (!persisted?.sessionId) return;
    const controller = new AbortController();
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch("/api/express", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "status", sessionId: persisted.sessionId }),
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 409) return;
        const payload = await response.json().catch(() => null) as StatusResponse | FailureResponse | null;
        if (stopped || !payload) return;
        if (payload.ok === false) {
          if (payload.code === "expired" || payload.code === "not_found") {
            sessionStorage.removeItem(STORAGE_KEY);
            setPersisted(null);
            setError("This demo expired. Click Start again.");
          }
          return;
        }
        if (!response.ok || payload.action !== "status") return;
        setPersisted((current) => current ? { ...current, expiresAt: payload.expiresAt } : current);
        if (Array.isArray(payload.events) && payload.events.length) {
          setEvents((current) => [...current, ...payload.events].slice(-100));
        }
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          // The next poll retries; explicit actions surface actionable failures.
        }
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1_500);
    return () => {
      stopped = true;
      clearInterval(timer);
      controller.abort();
    };
  }, [persisted?.sessionId]);

  const runCommand = persisted
    ? `npm run hosted -- --endpoint="${persisted.workspace.endpointBase.replace(/\/$/, "")}" --merchant="${persisted.workspace.merchant}"`
    : "Click Start to unlock this command.";

  const delivered = events.filter((event) => event.type === "delivery_200");
  const blocked = events.some((event) => event.type === "purchase_blocked");
  const complete = delivered.length >= 3 && blocked;
  const transactions = useMemo(() => {
    const seen = new Set<string>();
    return events.flatMap((event) => {
      if (event.type !== "payment_tx" && event.type !== "delivery_200") return [];
      const hash = hashValue(event.hash);
      if (!hash || seen.has(hash)) return [];
      seen.add(hash);
      return [{ hash, resource: valueText(event.resource) || "resource" }];
    });
  }, [events]);
  async function copyValue(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(""), 1_800);
    } catch {
      setError("Clipboard access was unavailable. Select and copy the command manually.");
    }
  }

  async function createWorkspace() {
    if (creating || persisted) return;
    setCreating(true);
    setError("");
    setEvents([]);
    try {
      const response = await fetch("/api/express", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create" }),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as CreateResponse | FailureResponse | null;
      if (!payload) {
        throw new Error("The demo could not start. Try again.");
      }
      if (payload.ok === false) {
        throw new Error("The demo could not start. Try again.");
      }
      if (!response.ok || payload.action !== "create") {
        throw new Error("The demo could not start. Try again.");
      }
      const next = { sessionId: payload.sessionId, expiresAt: payload.expiresAt, workspace: payload.workspace };
      if (!isWorkspace(next)) throw new Error("The demo could not start. Try again.");
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setPersisted(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The demo could not start. Try again.");
    } finally {
      setCreating(false);
    }
  }

  async function resetWorkspace() {
    if (!persisted || resetting) return;
    setResetting(true);
    setError("");
    try {
      const response = await fetch("/api/express", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reset", sessionId: persisted.sessionId }),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) throw new Error("Session could not close. Your session is retained; try again.");
      sessionStorage.removeItem(STORAGE_KEY);
      setPersisted(null);
      setEvents([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Session could not close. Try again.");
    } finally {
      setResetting(false);
    }
  }

  const visibleEvents = events.filter((event) => [
    "request",
    "challenge_402",
    "payment_submit",
    "payment_tx",
    "proof_verified",
    "delivery_200",
    "budget",
    "purchase_blocked",
    "result",
  ].includes(event.type));

  return <><p className="eyebrow">Docs / Hosted walkthrough</p><h1>Research Source Scout.</h1>
    <p className="lead">Optional browser companion for the Testnet SDK starter. Your local consumer retains its signing keys and recovery evidence.</p>
    <p>This alpha companion is moving to Vercel. Hosted sessions remain unavailable until durable storage and recovery are configured. Use the local Testnet starter in the meantime.</p>
    <p>Install Research Source Scout from <a href="/docs/quickstarts">Quick starters</a>, then start a session here.</p>
    <a className="secondary-action" href="/docs/quickstarts">Run the local Testnet starter</a>
    {error && <p role="alert">{error}</p>}
    {persisted && <><h2>Run the consumer</h2><CodeBlock>{runCommand}</CodeBlock><button className="secondary-action" onClick={() => copyValue(runCommand, "run")}>Copy run command</button><p role="status">{copied === "run" ? "Copied" : ""}</p><p>Price: {persisted.workspace.priceXlm} XLM · Budget: {persisted.workspace.budgetXlm} XLM · <a href={contractUrl(persisted.workspace.contractId)}>Testnet contract</a></p></>}
    <h2>Progress</h2><p role="status">{complete ? "Complete: three deliveries and the fourth purchase rejected." : `${delivered.length}/3 delivered · ${blocked ? "Spending limit verified" : "Spending-limit check pending"}`}</p>
    <ol>{transactions.map((tx) => <li key={tx.hash}><a href={txUrl(tx.hash)}>{tx.resource} — Stellar receipt</a></li>)}</ol>
    <details><summary>Session events</summary><pre>{visibleEvents.map((event) => `${event.type}${hashValue(event.hash) ? ` · ${hashValue(event.hash)}` : ""}`).join("\n") || "Waiting for local consumer requests."}</pre></details>
    {persisted && <><p>After all local payment evidence is resolved, close this hosted session.</p><button className="secondary-action" disabled={resetting} onClick={resetWorkspace}>{resetting ? "Closing…" : "Close session"}</button></>}
  </>;
}
