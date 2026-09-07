import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { presentCliTestLogs } from "../lib/cli-test-presentation.ts";

// Exercise only the parent panel with synthetic React hooks and GET responses.
// The interactive child's identity is retained in the rendered tree, but its
// signer/payment callbacks are not executed by this parent regression test.
const source = readFileSync(new URL("../components/CliMainnetTestPanel.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const InteractiveChild = function SyntheticInteractiveIdentity() {};
const FUNDING_HASH = "a".repeat(64);
const PAYMENT_HASH = "b".repeat(64);
const completed = () => ({ configured: true, state: "succeeded", version: "0.2.1", sourceCommit: "8c74bef",
  run: { id: "synthetic-retained-run", state: "succeeded", fundingHash: FUNDING_HASH,
    owner: "synthetic-owner", payer: "synthetic-payer", agent: "synthetic-agent", merchant: "synthetic-merchant",
    logs: `Earlier failed setup remains recorded\nACKRATE CLI 0.2.1\nmarket delivered after verified payment tx=\x1b]8;;https://stellar.expert/explorer/public/tx/${PAYMENT_HASH}\x07${PAYMENT_HASH}\x1b]8;;\x07\nVerified result\n3 protected research sources` } });

function nodes(value, result = []) {
  if (Array.isArray(value)) value.forEach((child) => nodes(child, result));
  else if (value && typeof value === "object") { result.push(value); nodes(value.props?.children, result); }
  return result;
}
const text = (value) => Array.isArray(value) ? value.map(text).join("")
  : value && typeof value === "object" ? text(value.props?.children)
    : typeof value === "string" || typeof value === "number" ? String(value) : "";

function harness(initial, options = {}) {
  const slots = [], effects = [], calls = [], downloads = [];
  const timers = new Map();
  let cursor = 0, timerId = 0, dirty = true, tree;
  const h = { response: initial, reject: Boolean(options.reject), ok: options.ok !== false, calls, downloads, timers };
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initialValue) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: initialValue };
      return [slots[index].value, (next) => { slots[index].value = typeof next === "function" ? next(slots[index].value) : next; dirty = true; }];
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) {
        const old = slots[index]; slots[index] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[index].cleanup = callback(); });
      }
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Error, AbortController, Blob,
    URL: { createObjectURL(blob) { downloads.push(blob); return "blob:synthetic-evidence"; }, revokeObjectURL() {} },
    document: { body: { append() {} }, createElement() { return { click() {}, remove() {} }; } },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: Symbol.for("synthetic.fragment") };
      if (name === "./CliMainnetTest") return { __esModule: true, default: InteractiveChild };
      if (name === "../lib/cli-test-presentation") return { presentCliTestLogs };
      throw new Error(`Unexpected parent import: ${name}`);
    },
    async fetch(url, init = {}) {
      calls.push({ url, method: init.method || "GET", body: init.body, signal: init.signal });
      if (h.reject) throw new Error("synthetic unavailable status service");
      return { ok: h.ok, json: async () => structuredClone(h.response) };
    },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  });
  h.render = () => { cursor = 0; dirty = false; tree = module.exports.default(); while (effects.length) effects.shift()(); return tree; };
  h.settle = async () => {
    for (let i = 0; i < 5; i++) { await new Promise((resolve) => setImmediate(resolve)); if (dirty) h.render(); }
  };
  h.tick = async () => {
    for (const [id, timer] of [...timers]) if (timer.delay === 3000) { timers.delete(id); await timer.callback(); }
    await h.settle();
  };
  h.nodes = () => nodes(tree);
  h.text = () => text(tree);
  h.find = (type, label) => h.nodes().find((node) => node.type === type && (label === undefined || text(node).includes(label)));
  h.assertInteractive = () => {
    const all = h.nodes();
    const interactive = all.filter((node) => node.type === InteractiveChild);
    assert.equal(interactive.length, 1, "exactly one interactive Freighter component is always rendered");
    assert.equal(Object.keys(interactive[0].props || {}).length, 0, "team status cannot inject gating props into the interactive flow");
    for (const detail of all.filter((node) => node.type === "details")) assert.ok(!nodes(detail).includes(interactive[0]), "interactive flow is not hidden inside recorded evidence");
    const evidence = all.find((node) => node.type === "section" && node.props?.["aria-label"] === "Mainnet CLI test status");
    if (evidence) assert.ok(all.indexOf(interactive[0]) < all.indexOf(evidence), "interactive flow precedes team evidence");
  };
  h.assertReadOnly = () => {
    assert.ok(calls.length > 0);
    for (const call of calls) { assert.equal(call.url, "/api/cli/test/burner"); assert.equal(call.method, "GET"); assert.equal(call.body, undefined); }
  };
  h.unmount = () => { for (const slot of slots) slot.cleanup?.(); };
  h.render();
  return h;
}

test("Freighter child is present immediately and is not gated by loading team status", async () => {
  const h = harness(completed());
  h.assertInteractive();
  await h.settle(); h.assertInteractive(); h.assertReadOnly();
});

test("completed configured team run remains collapsed secondary evidence while Freighter stays primary", async () => {
  const h = harness(completed()); await h.settle(); h.assertInteractive();
  const evidence = h.nodes().find((node) => node.type === "section" && node.props?.["aria-label"] === "Mainnet CLI test status");
  assert.ok(evidence, "recorded team evidence remains available");
  const holder = h.nodes().find((node) => node.type === "details" && nodes(node).includes(evidence));
  assert.ok(holder, "recorded team evidence is inside a disclosure"); assert.ok(holder.props.open === undefined || holder.props.open === false);
  assert.match(h.text(), /Payment test passed/); assert.match(h.text(), /Earlier failed setup remains recorded/);
  const hrefs = h.nodes().filter((node) => node.type === "a").map((node) => node.props.href);
  assert.ok(hrefs.includes(`https://stellar.expert/explorer/public/tx/${FUNDING_HASH}`));
  assert.ok(hrefs.includes(`https://stellar.expert/explorer/public/tx/${PAYMENT_HASH}`));
  h.assertReadOnly();
});

test("unconfigured, missing, malformed and unavailable team status never replace the Freighter child", async () => {
  for (const response of [{ configured: false, state: "not-configured" }, undefined, null, {},
    { configured: true, state: "unavailable", error: "synthetic unavailable" }, { configured: "true", state: "succeeded" }]) {
    const h = harness(response); h.assertInteractive(); await h.settle(); h.assertInteractive(); await h.tick(); h.assertInteractive(); h.assertReadOnly();
  }
  for (const options of [{ reject: true }, { ok: false }]) {
    const h = harness(completed(), options); await h.settle(); h.assertInteractive(); h.assertReadOnly();
  }
});

test("team running, failed and blocked states cannot hide or disable independent Freighter controls", async () => {
  for (const state of ["initializing", "funding", "running", "failed", "blocked"]) {
    const response = completed(); response.state = state; response.run.state = state; response.error = `synthetic ${state}`;
    const h = harness(response); await h.settle(); h.assertInteractive(); await h.tick(); h.assertInteractive(); h.assertReadOnly();
  }
});

test("removing team funding configuration preserves existing receipts beside the interactive flow", async () => {
  const response = completed(); response.configured = false;
  const h = harness(response); await h.settle(); h.assertInteractive();
  assert.match(h.text(), /Payment test passed/);
  assert.ok(h.nodes().some((node) => node.type === "a" && node.props.href.endsWith(FUNDING_HASH)));
  h.assertReadOnly();
});

test("transient team status errors retain recorded evidence without gating Freighter or sending POSTs", async () => {
  const h = harness(completed()); await h.settle(); h.reject = true; await h.tick();
  h.assertInteractive(); assert.match(h.text(), /Connection interrupted/); assert.match(h.text(), /Payment test passed/);
  assert.ok(h.nodes().some((node) => node.type === "a" && node.props.href.endsWith(FUNDING_HASH)));
  assert.match(h.text(), /Earlier failed setup remains recorded/);
  h.reject = false; await h.tick(); h.assertInteractive(); assert.doesNotMatch(h.text(), /Connection interrupted/); h.assertReadOnly();
});

test("viewing, polling and downloading retained team evidence are read-only and polling cleans up", async () => {
  const status = completed(); const h = harness(status); await h.settle(); await h.tick();
  const download = h.find("button", "Download test evidence"); assert.ok(download); assert.equal(download.props.disabled, false);
  download.props.onClick(); assert.equal(h.downloads.length, 1);
  assert.deepEqual(JSON.parse(await h.downloads[0].text()), status); h.assertReadOnly(); h.assertInteractive();
  const count = h.calls.length; h.unmount(); assert.equal(h.calls[0].signal.aborted, true);
  await h.tick(); assert.equal(h.calls.length, count);
});
