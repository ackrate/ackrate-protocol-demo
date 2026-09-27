import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { act, createElement, Fragment, StrictMode, type AnchorHTMLAttributes } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import ts from "typescript";
import ThemeToggle from "../components/ThemeToggle";
import AckrateArchMark from "../components/AckrateArchMark";
import WalletNavPortal, { WALLET_NAV_SLOT_ID } from "../components/wallet/WalletNavPortal";

const require = createRequire(import.meta.url);
let pathname = "/wallet";
const compiled = ts.transpileModule(readFileSync(new URL("../components/Nav.tsx", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const module = { exports: {} as { default: typeof ThemeToggle } };
vm.runInNewContext(compiled, {
  module, exports: module.exports,
  get document() { return globalThis.document; },
  get Node() { return globalThis.Node; },
  require: (name: string) => {
    if (name === "next/navigation") return { usePathname: () => pathname };
    if (name === "next/link") return { default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props) };
    if (name === "./ThemeToggle") return { default: ThemeToggle };
    if (name === "./AckrateArchMark") return { default: AckrateArchMark };
    if (name === "./wallet/WalletNavPortal") return { WALLET_NAV_SLOT_ID };
    return require(name);
  },
});
const Nav = module.exports.default;

test("wallet controls portal into the shared nav once, update, clean up, and remount across routes", async (t) => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "https://example.test/wallet", pretendToBeVisual: true });
  Object.defineProperty(dom.window, "matchMedia", { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  const globals = { window: dom.window, document: dom.window.document, Node: dom.window.Node, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { errors.push(args); });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("The navigation fixture must not make network requests"); });
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  let disconnects = 0;
  const render = async (route: string, mounted: boolean, busy = false) => {
    pathname = route;
    await act(async () => root.render(createElement(StrictMode, null,
      createElement(Fragment, null, createElement(Nav), mounted && createElement(WalletNavPortal, null,
        createElement("button", { className: "site-nav-disconnect", disabled: busy, "aria-busy": busy || undefined, onClick: () => { disconnects += 1; } }, busy ? "Disconnecting…" : "Disconnect"))),
    )));
  };
  const buttons = () => container.querySelectorAll<HTMLButtonElement>(".site-nav-disconnect");
  try {
    await render("/wallet", true);
    assert.equal(buttons().length, 1, "StrictMode must not duplicate the portaled control");
    assert.equal(buttons()[0].closest("nav")?.getAttribute("aria-label"), "Main navigation");
    assert.equal(buttons()[0].parentElement?.id, WALLET_NAV_SLOT_ID);
    await act(async () => buttons()[0].click());
    assert.equal(disconnects, 1, "one activation invokes the wallet-owned callback once");
    const button = buttons()[0];
    await render("/wallet", true, true);
    assert.equal(buttons()[0], button, "state changes update the same control");
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute("aria-busy"), "true");
    await act(async () => button.click());
    assert.equal(disconnects, 1, "busy controls do not invoke disconnect again");

    await render("/wallet/diagnostics", false);
    assert.equal(buttons().length, 0, "leaving the wallet removes its portaled action");
    assert.equal(container.querySelector('a[href="/wallet/diagnostics"]')?.getAttribute("aria-current"), "page");
    assert.equal(container.querySelector(`#${WALLET_NAV_SLOT_ID}`)?.childNodes.length, 0);
    await render("/docs", false);
    assert.equal(container.querySelector(`#${WALLET_NAV_SLOT_ID}`), null);
    assert.equal(container.querySelector('a[href="/wallet/diagnostics"]'), null);
    await render("/wallet", true);
    assert.equal(buttons().length, 1, "returning to the wallet locates the new nav slot");
    await act(async () => buttons()[0].click());
    assert.equal(disconnects, 2);

    const details = container.querySelector("details")!;
    details.open = true;
    await act(async () => details.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(details.open, false);
    assert.equal(dom.window.document.activeElement, details.querySelector("summary"));
    details.open = true;
    await act(async () => details.querySelector("summary")!.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true })));
    assert.equal(details.open, true, "pointer activity inside Docs must keep its links available");
    await act(async () => container.querySelector(".wordmark")!.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true })));
    assert.equal(details.open, false, "outside pointer activity dismisses Docs");
    details.open = true;
    await act(async () => details.querySelector("summary")!.focus());
    await act(async () => details.querySelector<HTMLAnchorElement>("a")!.focus());
    assert.equal(details.open, true, "tabbing within Docs preserves the menu");
    await act(async () => container.querySelector<HTMLAnchorElement>(".wordmark")!.focus());
    assert.equal(details.open, false, "moving keyboard focus outside Docs dismisses it");
    details.open = true;
    await render("/wallet/diagnostics", false);
    assert.equal(container.querySelector("details")!.open, false, "route changes close Docs");
    await render("/wallet-x", false);
    assert.equal(container.querySelector('a[href="/wallet/diagnostics"]'), null, "unrelated path prefixes are not wallet routes");
    await render("/reports/fixture", false);
    assert.equal(container.querySelector("nav"), null);
    assert.deepEqual(errors, [], "portal lifecycle must not cause React reconciliation errors");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]!);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
