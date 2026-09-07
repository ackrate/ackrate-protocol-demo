import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { Keypair } from "@stellar/stellar-sdk";
import { loadAppConfig } from "../lib/wallet/app-config";
import * as readiness from "../lib/wallet/client-readiness";
import * as registration from "../lib/wallet/registration-recovery";
import * as notifications from "../lib/wallet/notifications";
import * as catalog from "../lib/wallet/marketplace-catalog";

// Execute the shipped component and its callbacks/effects with synthetic hooks,
// browser storage and read-only API responses. This is not a live wallet test.
const source = readFileSync(new URL("../components/wallet/WalletChatApp.tsx", import.meta.url), "utf8");
const syntax = ts.createSourceFile("WalletChatApp.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = syntax.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "WalletChatApp")!;
const stateNames = component.body!.statements.flatMap((node) => ts.isVariableStatement(node)
  ? node.declarationList.declarations.flatMap((declaration) => ts.isArrayBindingPattern(declaration.name)
    && declaration.initializer && ts.isCallExpression(declaration.initializer)
    && declaration.initializer.expression.getText(syntax) === "useState"
    ? [declaration.name.elements[0]!.getText(syntax)] : []) : []);
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const USER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 41)).publicKey();
const AGENT = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 42)).publicKey();
const config = loadAppConfig({ NODE_ENV: "test", ACKRATE_WALLET_NETWORK: "mainnet", ACKRATE_CHAT_AGENT_PUBLIC_KEY: AGENT, ACKRATE_APP_ORIGIN: "https://example.test" }).public;
config.ready = true;
const now = Math.floor(Date.now() / 1000);
const pending = { txHash: "b".repeat(64), signedTransactionXdr: "synthetic-retained-registration-envelope", submittedAt: now, validUntil: now + 600 };
const record = () => ({
  schemaVersion: 2, id: "d".repeat(64), credentialHash: "c".repeat(64), registryId: config.mandateRegistryId,
  releaseFingerprint: config.releaseFingerprint, user: USER, agent: AGENT, merchant: AGENT,
  asset: config.asset.contractId, maxAmount: "1000000", expiry: now + 3600, decimals: 7,
  registrationState: "pending", pendingRegistration: pending,
});
type Element = { type?: unknown; props?: Record<string, any> };
const textContent = (element: any): string => typeof element === "string" || typeof element === "number" ? String(element)
  : Array.isArray(element) ? element.map(textContent).join("") : element?.props ? textContent(element.props.children) : "";
const nodes = (element: any): Element[] => Array.isArray(element) ? element.flatMap(nodes)
  : element?.props ? [element, ...nodes(element.props.children)] : [];

function harness(initial: Record<string, any> | null, status: "confirmed" | "pending" | "failed" = "confirmed", signingFence?: Promise<void>) {
  const states: Record<string, any> = {
    config, session: { authenticated: true, address: USER, network: "mainnet", expiresAt: now + 3600 },
    walletAddress: USER, stored: initial, marketplaceSelected: true, serviceConfigured: true,
    walletBalances: { address: USER, xlm: "5", usdc: "1", xlmRaw: "5", usdcRaw: "1", hasUsdcTrustline: true },
    marketplaceQuote: { price: "0.02", payTo: AGENT, relay: AGENT, expiresAt: now + 1800 },
  };
  const storage = new Map<string, string>();
  const key = `ackrate:mandate:v2:${config.network}:${config.mandateRegistryId}:${USER}`;
  if (initial) storage.set(key, JSON.stringify(initial));
  const calls: string[] = [], checks: unknown[] = [];
  const refs: any[] = [], effects: any[] = [], callbacks: any[] = [];
  const timers = new Map<number, () => void>();
  let stateCursor = 0, refCursor = 0, effectCursor = 0, callbackCursor = 0, timerId = 0, dirty = true;
  let tree: Element;
  const queued: (() => void)[] = [];
  const same = (a: unknown[] | undefined, b: unknown[] | undefined) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const hooks = {
    useState(initialValue: any) {
      const name = stateNames[stateCursor++];
      assert.ok(name, "every state hook comes from the actual component");
      if (!(name in states)) states[name] = typeof initialValue === "function" ? initialValue() : initialValue;
      return [states[name], (next: any) => {
        const value = typeof next === "function" ? next(states[name]) : next;
        if (!Object.is(value, states[name])) { states[name] = value; dirty = true; }
      }];
    },
    useRef(value: unknown) { const index = refCursor++; return refs[index] ??= { current: value }; },
    useMemo(callback: () => unknown) { return callback(); },
    useCallback(callback: unknown, deps: unknown[]) {
      const index = callbackCursor++;
      if (!same(callbacks[index]?.deps, deps)) callbacks[index] = { deps, callback };
      return callbacks[index].callback;
    },
    useEffect(callback: () => unknown, deps: unknown[]) {
      const index = effectCursor++;
      if (!same(effects[index]?.deps, deps)) {
        const previous = effects[index];
        effects[index] = { deps };
        queued.push(() => { previous?.cleanup?.(); effects[index].cleanup = callback(); });
      }
    },
  };
  class RegistrationNotSubmittedError extends Error {}
  const clients = {
    RegistrationNotSubmittedError, AllowanceNotSubmittedError: class extends Error {}, AllowanceSubmissionRejected: class extends Error {},
    buildMandate: () => { calls.push("build-registration"); const item = record(); return { ...item, id: item.credentialHash, idBuffer: Buffer.from(item.credentialHash, "hex"), maxAmount: BigInt(item.maxAmount) }; },
    registerRetainedWithFreighter: async (_config: unknown, _intent: unknown, onPrepared: (id: string) => void, onSigned: (evidence: unknown) => void) => {
      calls.push("sign-registration"); onPrepared(record().id);
      if (signingFence) await signingFence;
      onSigned(pending);
      calls.push("submit-registration"); throw new Error("Synthetic lost confirmation response");
    },
    prepareAllowanceTransaction: async () => { calls.push("prepare-allowance-read-only"); return "synthetic-unsigned-allowance"; },
    submitPreparedAllowanceWithFreighter: () => { throw new Error("No allowance signing is permitted in this test"); },
  };
  const modules: Record<string, unknown> = {
    react: hooks, "react/jsx-runtime": { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) },
    "next/link": { default: "a" }, "framer-motion": { AnimatePresence: "fragment", motion: new Proxy({}, { get: (_target, name) => name }), useReducedMotion: () => true },
    "lucide-react": new Proxy({}, { get: (_target, name) => name }),
    "@/lib/wallet/mandate-client": clients,
    "@/lib/wallet/freighter": { freighterSessionState: async () => "matches" },
    "@/lib/wallet/marketplace-catalog": catalog,
    "./AssistantThread": { AssistantThread: "assistant-thread", PurchaseReport: "purchase-report", parseRecovery: () => null },
    "./ServiceConfigurator": { ServiceConfigurator: "service-configurator", initialServiceInputValues: () => ({ q: "What is Stellar?" }), serializedServiceInputs: () => ({ q: "What is Stellar?" }) },
    "@/lib/wallet/client-readiness": { ...readiness, allowanceTransactionIsFresh: () => true },
    "@/lib/wallet/allowance-sequence": {}, "@/lib/wallet/notifications": notifications,
    "../../lib/wallet/registration-recovery": { ...registration, readRegistrationConfirmation: async (_config: unknown, saved: unknown, evidence: unknown) => {
      calls.push("read-registration"); checks.push({ saved, evidence }); return status;
    } },
  };
  const module = { exports: {} as { WalletChatApp: () => Element } };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Buffer, Error, Date, AbortController, AbortSignal, URL,
    console: { error() {}, warn() {} },
    require(name: string) { assert.ok(Object.hasOwn(modules, name), `Unexpected UI import: ${name}`); return modules[name]; },
    localStorage: { getItem: (name: string) => storage.get(name) ?? null, setItem: (name: string, value: string) => storage.set(name, value), removeItem: (name: string) => storage.delete(name) },
    window: { addEventListener() {}, removeEventListener() {}, scrollTo() {}, location: { reload() {} },
      setInterval: () => ++timerId, clearInterval() {},
      setTimeout: (callback: () => void) => { timers.set(++timerId, callback); return timerId; }, clearTimeout: (id: number) => timers.delete(id) },
    fetch: async (url: string, init?: RequestInit) => {
      calls.push(`api:${url}`);
      if (url === "/api/wallet/config") return Response.json({ ok: true, config });
      if (url === "/api/wallet/auth/session") {
        if (init?.method === "DELETE") calls.push("delete-session");
        return Response.json({ ok: true, session: states.session });
      }
      if (url.startsWith("/api/wallet/balances?")) return Response.json({ ok: true, balances: states.walletBalances });
      if (url === "/api/wallet/mandate/status") {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.mandateId, record().id);
        return Response.json({ ok: true, mandate: { ...record(), spent: "0", remaining: "1000000", seq: 0, status: "Active" } });
      }
      throw new Error(`Unexpected API: ${url}`);
    },
  });
  function render() {
    stateCursor = 0; refCursor = 0; effectCursor = 0; callbackCursor = 0;
    dirty = false; tree = module.exports.WalletChatApp();
    for (const effect of queued.splice(0)) effect();
  }
  return {
    states, storage, calls, checks, key,
    configured() { states.marketplaceSelected = true; states.serviceConfigured = true; dirty = true; },
    async flush() {
      for (let count = 0; count < 25; count += 1) {
        if (dirty) render();
        await new Promise((resolve) => setImmediate(resolve));
        if (!dirty) return;
      }
      throw new Error("UI did not settle within 25 synthetic renders");
    },
    button(pattern: RegExp, enabledOnly = false) { const result = nodes(tree).find((element) => element.props?.onClick && (!enabledOnly || !element.props.disabled) && pattern.test(textContent(element))); assert.ok(result, `Button not found: ${pattern}`); return result.props!; },
    text() { return textContent(tree); },
    dispose() { for (const effect of effects) effect?.cleanup?.(); },
  };
}

test("actual wallet reload recovers the original registration and never opens Freighter again", async () => {
  const h = harness(record());
  try {
    await h.flush();
    const saved = JSON.parse(h.storage.get(h.key)!);
    assert.equal(saved.id, record().id);
    assert.equal(saved.registrationTx, pending.txHash);
    assert.equal(saved.pendingRegistration, undefined);
    assert.equal(saved.registrationAttempts[0].signedTransactionXdr, pending.signedTransactionXdr);
    assert.ok(h.calls.includes("read-registration"));
    assert.equal(h.calls.includes("sign-registration"), false);
    assert.equal(h.calls.includes("submit-registration"), false);
  } finally { h.dispose(); }
});

test("actual wallet lost-confirmation callback preserves the signed attempt and switches to read-only recovery", async () => {
  const h = harness(null);
  try {
    await h.flush();
    h.configured();
    await h.flush();
    const register = h.button(/1 of 2 · Register mandate/);
    assert.equal(register.disabled, false);
    await register.onClick();
    await h.flush();
    const saved = JSON.parse(h.storage.get(h.key)!);
    assert.equal(saved.registrationTx, pending.txHash);
    assert.equal(saved.id, record().id);
    assert.equal(saved.registrationAttempts[0].signedTransactionXdr, pending.signedTransactionXdr);
    assert.equal(h.calls.filter((call) => call === "sign-registration").length, 1);
    assert.equal(h.calls.filter((call) => call === "submit-registration").length, 1);
    assert.ok(h.calls.includes("read-registration"));
  } finally { h.dispose(); }
});

test("actual wallet preserves legacy ID-only unknown registration rather than offering replacement", async () => {
  const old = { ...record(), pendingRegistration: undefined, registrationState: undefined };
  const h = harness(old);
  try {
    await h.flush();
    h.configured();
    await h.flush();
    assert.equal(h.calls.includes("sign-registration"), false);
    assert.equal(h.calls.includes("build-registration"), false);
    assert.equal(JSON.parse(h.storage.get(h.key)!).id, old.id);
    const check = h.button(/Resume registration check/);
    await check.onClick();
    await h.flush();
    assert.equal(h.calls.includes("sign-registration"), false);
    assert.equal(h.calls.includes("submit-registration"), false);
    assert.match(h.text(), /replacement remains blocked/);
  } finally { h.dispose(); }
});

test("disconnect during an outstanding wallet signature cannot delete a later retained registration", async () => {
  let release!: () => void;
  const h = harness(null, "confirmed", new Promise<void>((resolve) => { release = resolve; }));
  try {
    await h.flush(); h.configured(); await h.flush();
    const registering = h.button(/1 of 2 · Register mandate/).onClick();
    await h.flush();
    assert.equal(h.states.phase, "registering");
    await h.button(/^Disconnect$/, true).onClick();
    await h.flush();
    await h.button(/^Disconnect wallet$/, true).onClick();
    await h.flush();
    assert.equal(h.calls.includes("delete-session"), false, "disconnect must not clear state while signing is unresolved");
    release();
    await registering;
    await h.flush();
    const saved = JSON.parse(h.storage.get(h.key)!);
    assert.equal(saved.id, record().id);
    assert.equal(saved.pendingRegistration.txHash, pending.txHash);
    assert.equal(saved.pendingRegistration.signedTransactionXdr, pending.signedTransactionXdr);
    assert.equal(h.calls.filter((call) => call === "submit-registration").length, 1);
    assert.equal(h.calls.includes("delete-session"), false);
  } finally { release(); h.dispose(); }
});
