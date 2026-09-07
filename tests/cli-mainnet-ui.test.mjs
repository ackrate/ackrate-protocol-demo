import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Exercise the actual component callbacks with synthetic hooks, storage and
// Freighter/API responses. This is not a DOM/browser or live-payment test.
const source = readFileSync(new URL("../components/CliMainnetTest.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const OWNER = `G${"A".repeat(55)}`;
const OTHER = `G${"B".repeat(55)}`;
const MAINNET = "Public Global Stellar Network ; September 2015";
const STORAGE = "ackrate:cli-test:funding:v1:run-1";
const base = () => ({ ready: true, version: "0.2.1", sourceCommit: "8c74bef", publishedVersion: "0.2.1" });
const run = (state = "prepared") => ({
  id: "run-1", state, owner: OWNER, payer: OTHER, agent: `G${"C".repeat(55)}`,
  merchant: `G${"D".repeat(55)}`, fundingXdr: "synthetic-original-envelope",
  fundingExpiresAt: Math.floor(Date.now() / 1000) + 600, logs: "", createdAt: 1, updatedAt: 1,
});
const saved = (item = run()) => ({
  version: 1, runId: item.id, owner: item.owner, originalXdr: item.fundingXdr,
  signedXdr: "synthetic-saved-envelope", savedAt: Date.now(),
});

function harness(initial = base(), options = {}) {
  const slots = [];
  const effects = [];
  const timers = new Map();
  const storage = new Map(options.storage || []);
  const calls = [];
  let cursor = 0, nextTimer = 0, tree, dirty = true;
  const h = { status: structuredClone(initial), owner: OWNER, network: MAINNET, signer: OWNER, calls, storage, timers };
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    useState(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { value: typeof value === "function" ? value() : value };
      return [slots[i].value, (next) => {
        slots[i].value = typeof next === "function" ? next(slots[i].value) : next;
        dirty = true;
      }];
    },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useCallback(value, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value };
      return slots[i].value;
    },
    useEffect(callback, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) {
        const old = slots[i];
        slots[i] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[i].cleanup = callback(); });
      }
    },
  };
  const response = (body, ok = true) => ({ ok, json: async () => structuredClone(body) });
  const api = {
    requestAccess: async () => { calls.push({ kind: "connect" }); return { address: h.owner }; },
    getAddress: async () => { calls.push({ kind: "address" }); return { address: h.owner }; },
    getNetworkDetails: async () => ({ networkPassphrase: h.network }),
    signTransaction: async (xdr, opts) => {
      calls.push({ kind: "sign", xdr, opts });
      if (h.onSign) await h.onSign();
      return { signedTxXdr: `signed:${xdr}`, signerAddress: h.signer };
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports, module, Error, Date, Blob, URL,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === "@stellar/freighter-api") return api;
      if (name === "lucide-react") return Object.fromEntries(["Download", "ExternalLink", "Loader2", "WalletCards"].map((key) => [key, key]));
      throw new Error(`Unexpected import: ${name}`);
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        if (h.storageFails) throw new Error("Synthetic storage failure");
        calls.push({ kind: "save", key }); storage.set(key, value);
      },
    },
    fetch: async (url, init) => {
      assert.equal(url, "/api/cli/test", "the harness never permits a real network request");
      assert.equal(init.credentials, "same-origin");
      if (init.method !== "POST") {
        calls.push({ kind: "get" });
        return h.onGet ? h.onGet(response) : response(h.status);
      }
      const body = JSON.parse(init.body);
      calls.push({ kind: "post", body });
      if (h.onPost) return h.onPost(body, response);
      if (body.action === "challenge") return response({ challengeToken: "synthetic-challenge", xdr: "ownership-only" });
      if (body.action === "prepare") h.status.run = run();
      if (body.action === "fund") h.status.run.state = "funded";
      if (body.action === "run") h.status.run.state = "running";
      return response(h.status);
    },
    setTimeout: (callback, delay) => { timers.set(++nextTimer, { callback, delay }); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (callback, delay) => { timers.set(++nextTimer, { callback, delay, repeat: true }); return nextTimer; },
    clearInterval: (id) => timers.delete(id),
  });
  h.render = () => {
    cursor = 0; dirty = false;
    tree = module.exports.default();
    while (effects.length) effects.shift()();
    return tree;
  };
  h.settle = async () => {
    for (let i = 0; i < 12; i++) {
      await new Promise((resolve) => setImmediate(resolve));
      if (dirty) h.render();
    }
  };
  function nodes(value, result = []) {
    if (Array.isArray(value)) value.forEach((item) => nodes(item, result));
    else if (value && typeof value === "object") { result.push(value); nodes(value.props?.children, result); }
    return result;
  }
  const text = (value) => Array.isArray(value) ? value.map(text).join("")
    : value && typeof value === "object" ? text(value.props?.children)
      : typeof value === "string" || typeof value === "number" ? String(value) : "";
  h.text = () => text(tree);
  h.find = (type, label) => nodes(tree).find((node) => node.type === type && (label === undefined || text(node).includes(label)));
  h.click = (label) => {
    const button = h.find("button", label);
    assert.ok(button, `Missing button: ${label}`);
    assert.equal(Boolean(button.props.disabled), false, `Disabled button: ${label}`);
    button.props.onClick();
  };
  h.approve = () => { h.find("input").props.onChange({ target: { checked: true } }); h.render(); };
  h.tick = async (delay = 2000) => {
    for (const [id, timer] of [...timers]) {
      if (timer.delay !== delay) continue;
      if (!timer.repeat) timers.delete(id);
      await timer.callback();
    }
    await h.settle();
  };
  h.posts = () => calls.filter((call) => call.kind === "post").map((call) => call.body);
  h.signs = () => calls.filter((call) => call.kind === "sign");
  h.render();
  return h;
}

test("initial/unready state disables connection and exposes service errors", async () => {
  const h = harness({ ...base(), ready: false, error: "Synthetic service unavailable" });
  assert.equal(h.find("button", "Connect").props.disabled, true);
  await h.settle();
  assert.equal(h.find("button", "Connect").props.disabled, true);
  assert.match(h.text(), /Synthetic service unavailable/);
  h.find("button", "Connect").props.onClick();
  await h.settle();
  assert.equal(h.posts().length, 0);
  assert.equal(h.calls.filter((call) => call.kind === "connect").length, 0);
});

test("challenge response needs no ready field; preparation is separate from funding", async () => {
  const h = harness(); await h.settle(); h.click("Connect"); await h.settle();
  assert.deepEqual(h.posts().map((body) => body.action), ["challenge", "prepare"]);
  assert.deepEqual(h.posts()[1], { action: "prepare", owner: OWNER, challengeToken: "synthetic-challenge", signedXdr: "signed:ownership-only" });
  assert.equal(h.signs().length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.signs()[0].opts)), { networkPassphrase: MAINNET, address: OWNER });
  assert.equal(h.find("button", "Fund test").props.disabled, true);
  assert.match(h.text(), /Test runner: CLI 0\.2\.1/);
  assert.match(h.text(), /Byte-verified against published npm version 0\.2\.1/);
  assert.doesNotMatch(h.text(), /source build|unpublished|0\.2\.0/);
});

test("wrong Mainnet network or signer prevents preparation", async () => {
  const wrongNetwork = harness(); await wrongNetwork.settle(); wrongNetwork.network = "Test SDF Network ; September 2015";
  wrongNetwork.click("Connect"); await wrongNetwork.settle();
  assert.equal(wrongNetwork.posts().length, 0);
  assert.match(wrongNetwork.text(), /Switch Freighter to Stellar Mainnet/);
  const wrongSigner = harness(); await wrongSigner.settle(); wrongSigner.signer = OTHER;
  wrongSigner.click("Connect"); await wrongSigner.settle();
  assert.deepEqual(wrongSigner.posts().map((body) => body.action), ["challenge"]);
  assert.match(wrongSigner.text(), /different signing account/);
});

test("funding requires review, current owner, and saved exact envelope before one POST", async () => {
  const h = harness({ ...base(), run: run() }); await h.settle();
  assert.equal(h.find("button", "Fund test").props.disabled, true);
  h.approve(); h.click("Fund test"); h.click("Fund test"); await h.settle();
  assert.equal(h.signs().length, 1);
  assert.deepEqual(h.posts(), [{ action: "fund", signedXdr: "signed:synthetic-original-envelope" }]);
  const savedAt = h.calls.findIndex((call) => call.kind === "save");
  const postedAt = h.calls.findIndex((call) => call.kind === "post");
  assert.ok(savedAt >= 0 && savedAt < postedAt);
  assert.equal(JSON.parse(h.storage.get(STORAGE)).originalXdr, run().fundingXdr);
  assert.equal(h.calls.some((call) => call.kind === "connect"), false, "repeat approval uses a read-only address check");
  assert.equal(h.calls.some((call) => call.kind === "address"), true);
  assert.equal(h.find("button", "Run Mainnet").props.disabled, true);
});

test("account changes, storage failure, and network change during signing never submit funding", async () => {
  for (const mode of ["owner", "storage", "network"]) {
    const h = harness({ ...base(), run: run() }); await h.settle();
    if (mode === "owner") h.owner = OTHER;
    if (mode === "storage") h.storageFails = true;
    if (mode === "network") h.onSign = async () => { h.network = "Testnet"; };
    h.approve(); h.click("Fund test"); await h.settle();
    assert.equal(h.posts().length, 0, mode);
    assert.ok(h.find("p", mode === "owner" ? "original funding account" : mode === "storage" ? "could not save" : "network changed"), mode);
  }
});

test("saved recovery resubmits the exact envelope without a new signature; confirmed funding is not resubmitted", async () => {
  for (const alreadyFunded of [false, true]) {
    const h = harness({ ...base(), run: run("funding") }, { storage: [[STORAGE, JSON.stringify(saved())]] });
    await h.settle();
    if (alreadyFunded) h.status.run.state = "funded";
    h.click("Resume saved"); await h.settle();
    assert.equal(h.signs().length, 0);
    assert.deepEqual(h.posts(), alreadyFunded ? [] : [{ action: "fund", signedXdr: "synthetic-saved-envelope" }]);
  }
});

test("saved envelopes are bound to run, owner and original body", async () => {
  for (const patch of [{ runId: "other-run" }, { owner: OTHER }, { originalXdr: "changed-body" }]) {
    const h = harness({ ...base(), run: run("funding") }, { storage: [[STORAGE, JSON.stringify({ ...saved(), ...patch })]] });
    await h.settle();
    assert.equal(h.find("button", "Resume saved"), undefined);
    assert.equal(h.signs().length, 0);
  }
});

test("run requires a separate approval and freshly matched owner; network/owner changes fail closed", async () => {
  for (const mode of ["good", "owner", "network", "unready"]) {
    const h = harness({ ...base(), run: run("funded") }); await h.settle();
    assert.equal(h.find("button", "Run Mainnet").props.disabled, true);
    h.approve();
    if (mode === "owner") h.owner = OTHER;
    if (mode === "network") h.network = "Testnet";
    if (mode === "unready") h.status.ready = false;
    h.click("Run Mainnet"); await h.settle();
    assert.deepEqual(h.posts(), mode === "good" ? [{ action: "run", confirmRealUsdc: true }] : []);
    assert.equal(h.signs().length, 0);
  }
});

test("polling updates funding/running state and stops at completion, retaining plain output", async () => {
  const h = harness({ ...base(), run: run("funding") }); await h.settle();
  assert.ok([...h.timers.values()].some((timer) => timer.delay === 2000));
  h.status.run.state = "funded"; await h.tick();
  assert.match(h.text(), /Accounts funded/);
  assert.equal([...h.timers.values()].some((timer) => timer.delay === 2000), false);
  h.approve(); h.click("Run Mainnet"); await h.settle();
  h.status.run.state = "succeeded";
  h.status.run.logs = "\u001b[32mdone\u001b[0m <script>inert text</script>";
  await h.tick();
  assert.match(h.text(), /CLI test completed/);
  assert.equal(h.find("pre").props.children, "done <script>inert text</script>");
  assert.equal(h.find("pre").props.dangerouslySetInnerHTML, undefined);
  assert.equal([...h.timers.values()].some((timer) => timer.delay === 2000), false);
});

test("a late older poll cannot overwrite a newer confirmed status", async () => {
  const h = harness({ ...base(), run: run("funding") }); await h.settle();
  let finishOldRequest;
  let first = true;
  h.onGet = (response) => {
    if (first) {
      first = false;
      return new Promise((resolve) => { finishOldRequest = () => resolve(response({ ...base(), run: run("funding") })); });
    }
    return response(h.status);
  };
  const olderPoll = h.tick();
  h.status.run.state = "funded";
  h.click("Refresh status"); await h.settle();
  assert.match(h.text(), /Accounts funded/);
  finishOldRequest(); await olderPoll;
  assert.match(h.text(), /Accounts funded/);
  assert.equal(h.find("button", "Run Mainnet").props.disabled, true);
});

test("a transaction saved by another tab is recovered without another signing request", async () => {
  const h = harness({ ...base(), run: run() }); await h.settle();
  h.storage.set(STORAGE, JSON.stringify(saved()));
  h.approve(); h.click("Fund test"); await h.settle();
  assert.equal(h.signs().length, 0);
  assert.equal(h.posts().length, 0);
  assert.ok(h.find("button", "Resume saved"));
});

test("expired funding cannot be signed and retry errors remain visible", async () => {
  const h = harness({ ...base(), run: { ...run(), fundingExpiresAt: 1 } }); await h.settle();
  assert.equal(h.find("button", "Fund test").props.disabled, true);
  assert.match(h.text(), /transaction has expired/);
  const retry = harness({ ...base(), run: run("funding") }, { storage: [[STORAGE, JSON.stringify(saved())]] });
  await retry.settle(); retry.owner = OTHER;
  retry.click("Resume saved"); await retry.settle();
  assert.equal(retry.posts().length, 0);
  assert.match(retry.text(), /original funding account/);
});
