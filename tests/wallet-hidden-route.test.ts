import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { initialServiceInputValues, serializedServiceInputs, ServiceConfigurator } from "../components/wallet/ServiceConfigurator";
import { FALLBACK_MARKETPLACE_SERVICES } from "../lib/wallet/marketplace-catalog";
import { AssistantThread, confirmedPurchaseFromMessages, type PurchaseResult } from "../components/wallet/AssistantThread";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const surfaces = ["wallet", "experimental"] as const;
function journey(surface: typeof surfaces[number]): string {
  const paths = [`components/${surface}/WalletChatApp.tsx`];
  if (surface === "experimental") for (const name of ["shared", "ConnectStage", "MarketplaceStage", "ConfigureStage", "LimitStage", "RunStage", "ProofStage"]) paths.push(`components/experimental/stages/${name}.tsx`);
  return paths.map(read).join("\n");
}
function section(source: string, start: string, end: string): string {
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin + start.length);
  assert.ok(begin >= 0 && finish > begin, `Expected source section: ${start}`);
  return source.slice(begin, finish);
}
function includes(source: string, values: string[]) {
  for (const value of values) assert.ok(source.includes(value), `Expected ${value}`);
}

test("wallet and experimental remain separate pages with separate styles and indexing exclusions", () => {
  const nav = read("components/Nav.tsx");
  assert.match(nav, /\{ href: "\/wallet"/);
  assert.doesNotMatch(nav, /\{ href: "\/experimental"/);
  const robots = read("app/robots.ts");
  assert.match(robots, /disallow: \[[^\]]*"\/api\/"/);
  assert.match(robots, /disallow: \[[^\]]*"\/wallet"/);
  assert.match(robots, /disallow: \[[^\]]*"\/reports\/"/);
  for (const surface of surfaces) {
    const other = surface === "wallet" ? "experimental" : "wallet";
    const page = read(`app/${surface}/page.tsx`);
    assert.ok(page.includes(`@/components/${surface}/WalletChatApp`));
    assert.ok(!page.includes(`@/components/${other}/`));
    const layout = read(`app/${surface}/layout.tsx`);
    includes(layout, ["index: false", "follow: false", `canonical: "/${surface}"`]);
    assert.equal(read("app/sitemap.ts").includes(`"/${surface}"`), false);
  }
  const wallet = read("app/wallet/layout.tsx");
  includes(wallet, ["wallet.css", "wallet-monochrome.css", "wallet-flow.css"]);
  assert.doesNotMatch(wallet, /experimental-flow\.css|hall-root/);
  includes(read("app/experimental/layout.tsx"), ["experimental-flow.css", "hall-root"]);
});

for (const surface of surfaces) {
  const app = read(`components/${surface}/WalletChatApp.tsx`);
  const thread = read(`components/${surface}/AssistantThread.tsx`);
  const ui = journey(surface);

  test(`${surface}: connecting does not sign or register a mandate`, () => {
    const connect = section(app, "const connect = async () =>", "const authenticate = async () =>");
    const authenticate = section(app, "const authenticate = async () =>", "const activate = async () =>");
    assert.match(connect, /connectFreighter/);
    assert.doesNotMatch(connect, /auth\/challenge|signFreighterTransaction|registerWithFreighter|approveWithFreighter/);
    assert.match(authenticate, /auth\/challenge/);
    assert.match(authenticate, /signFreighterTransaction/);
    assert.match(ui, /Connecting does not create, sign, or send a Mainnet transaction/);
    assert.doesNotMatch(app, /"\/api\/(?:auth|config|mandate)/);
    includes(app, ['"/api/wallet/auth/challenge"', '"/api/wallet/mandate/status"']);
    assert.match(thread, /api: "\/api\/wallet\/chat"/);
  });

  test(`${surface}: choosing a discovered service retains inputs without making a payment`, () => {
    const choose = section(app, "const chooseMarketplaceService = () =>", "const changeMarketplaceService = () =>");
    includes(choose, ["JSON.stringify(marketplaceDraft)", "setMarketplaceService(marketplaceDraft)", "setServiceConfigured(false)", "initialServiceInputValues(marketplaceDraft)"]);
    assert.doesNotMatch(choose, /fetch\(|registerWithFreighter|signFreighterTransaction|submitPreparedAllowanceWithFreighter/);
    includes(app, ["/api/wallet/marketplace/services?q=", "https://agent402.tools/stellar", "service={marketplaceService}", "parameters={serviceInputValues}"]);
    includes(ui, ["service-inputs", "<ServiceConfigurator", "Configure {"]);
    if (surface === "wallet") assert.match(ui, /disabled=\{!isRunnableMarketplaceService\(/);
    else includes(ui, ["const runnable = isRunnable(draft)", "disabled={!runnable}"]);
    assert.match(thread, /serializedServiceInputs\(service, inputValues\)/);
  });

  test(`${surface}: spending requires registration, allowance, matching configuration, and enough balance`, () => {
    const activate = section(app, "const activate = async () =>", "const retryAllowance = async () =>");
    assert.match(activate, /registerWithFreighter/);
    assert.doesNotMatch(activate, /approveWithFreighter|submitPreparedAllowanceWithFreighter/);
    includes(app, ["prepareAllowanceTransaction", "submitPreparedAllowanceWithFreighter", "allowanceFailureMessage(cause)", "walletBalances?.hasUsdcTrustline", "walletBalances.usdcRaw"]);
    assert.match(app, /activeMandateReady = Boolean\(mandateOnline && mandateMatchesConfig && storedFresh && stored\?\.allowanceTx(?: && enoughRemaining)?\)/);
    if (surface === "wallet") {
      assert.match(app, /!serviceConfigured \? 3 : !showRun \? 4 : !completedPurchase \? 5 : 6/);
      includes(app, ["budgetAtomic >= minimumBudget", "canRun={activeMandateReady && quoteCurrent}", "showRun = activeMandateReady || recoverableRun", "recoverableRun = Boolean(stored?.allowanceTx && mandateMatchesConfig && mandate?.id === stored.id"]);
    }
    else {
      assert.match(app, /!serviceConfigured \? 3 : !activeMandateReady && !spentOut \? 4 : !completedPurchase \? 5 : 6/);
      assert.match(app, /spentOut = Boolean\(storedFresh && stored\?\.allowanceTx && mandateMatchesConfig && mandate\?\.status === "Exhausted"\)/);
    }
    if (surface === "wallet") {
      includes(ui, ["1 of 2 · Register mandate", "2 of 2 · Approve USDC allowance", "2 of 2 · Preparing allowance", "2 of 2 · Resume confirmation", "Mandate registration does not need to be repeated"]);
      const retry = section(app, "const retryAllowance = async () =>", "const confirmServiceInputs = async () =>");
      const pending = section(retry, "if (stored.pendingAllowance)", "if (stored.expiry");
      includes(pending, ["setAllowanceCheckAttempt", "return;"]);
      assert.doesNotMatch(pending, /registerWithFreighter|submitPreparedAllowanceWithFreighter|prepareAllowanceTransaction/);
    } else {
      assert.match(ui, /Open Freighter · Approve \$\{formatUnits\(/);
      assert.match(ui, /Preparing (?:secure approval|Freighter)/);
    }
    includes(ui, ["Your funds stay in your wallet", 'phase === "registering"']);
  });

  test(`${surface}: governance keys and expired mandates cannot authorize consumer setup`, () => {
    includes(app, ["walletAddress === config.contractAuthorityAddress", "session.address === config.contractAuthorityAddress", "Use a separate personal Mainnet wallet", "mandate.expiry > nowSeconds", "setInterval(() => setNowSeconds"]);
    includes(ui, ["Contract account detected", "This 2-of-3 account protects the contract"]);
    const authenticate = section(app, "const authenticate = async () =>", "const activate = async () =>");
    assert.ok(authenticate.indexOf("walletAddress === config.contractAuthorityAddress") < authenticate.indexOf('"/api/wallet/auth/challenge"'));
    assert.match(authenticate, /walletAddress === config\.contractAuthorityAddress\) \{[\s\S]*?return;/);
    assert.match(app, /useCallback\(async \(current: StoredMandate\)/);
    includes(app, ["if (parsed.registrationTx) void refreshMandate(parsed)", "if (stored) void refreshMandate(stored)"]);
    assert.doesNotMatch(app, /const current = candidate \?\? stored|}, \[stored\]\);/);
  });

  test(`${surface}: disconnect is visible and only clears site state after session deletion`, () => {
    const disconnect = section(app, surface === "wallet" ? "const finishDisconnect = async (confirmedMandate?: MandateView) =>" : "const disconnect = async () =>", "const chooseMarketplaceService = () =>");
    assert.match(ui, /Disconnect wallet/);
    assert.match(app, /onClick=\{(?:connected \? )?\(\) => setDisconnectOpen\(true\)/);
    assert.match(disconnect, /(?:mandate|latest)\?\.status === "Active" && (?:mandate|latest)\.expiry > Math\.floor\(Date\.now\(\) \/ 1_000\)/);
    includes(disconnect, ["First tap Turn off spending below. Then disconnect your wallet", 'await api("/api/wallet/auth/session", { method: "DELETE"', surface === "wallet" ? "Spending is off, but sign-out did not finish" : "Could not disconnect. Please try again"]);
    assert.match(disconnect, /catch \(cause\) \{[\s\S]*?return;/);
    assert.ok(disconnect.indexOf('method: "DELETE"') < disconnect.indexOf("setSession(emptySession)"));
    includes(disconnect, ["setSession(emptySession)", "setWalletAddress(null)", "setMarketplaceSelected(false)", "setServiceConfigured(false)", "setCompletedPurchase(null)", "localStorage.removeItem(mandateStorageKey(config, session.address))", "localStorage.removeItem(legacyMandateStorageKey(config, session.address))", 'localStorage.removeItem("ackrate:mainnet:last-payment")', "Wallet disconnected. Connect a wallet to start again"]);
    if (surface === "wallet") {
      includes(disconnect, ["confirmedMandate.id !== stored?.id", "confirmedMandate.user !== session.address", "localStorage.removeItem(marketplaceStorageKey(session.address))", "setDisconnectOpen(false)", "window.location.reload()"]);
      assert.ok(disconnect.indexOf("confirmedMandate.id !== stored?.id") < disconnect.indexOf('method: "DELETE"'));
      assert.ok(disconnect.indexOf('method: "DELETE"') < disconnect.indexOf("localStorage.removeItem"));
    }
    assert.doesNotMatch(disconnect, /localStorage\.clear\(/);
  });

  test(`${surface}: revocation verifies the same account and preserves its transaction proof`, () => {
    const revoke = section(app, surface === "wallet" ? "const revoke = async (disconnectAfter = false) =>" : "const revoke = async () =>", surface === "wallet" ? "const finishDisconnect = async" : "const disconnect = async () =>");
    includes(revoke, ["const address = await connectFreighter(config.networkPassphrase)", "Select the same wallet you connected to Ackrate", "await revokeWithFreighter"]);
    if (surface === "wallet") {
      includes(revoke, ["address !== current.user", '!current.revokeTx && !current.pendingRevokeTx', "pendingRevokeTx: hash", "await refreshMandate(current)", 'confirmed.status !== "Revoked" && attempt < 10', 'if (confirmed.status !== "Revoked")', 'if (disconnectAfter)', "await finishDisconnect(confirmed)"]);
      const finalConfirmation = revoke.lastIndexOf('if (confirmed.status !== "Revoked")');
      assert.ok(finalConfirmation > revoke.indexOf("await revokeWithFreighter"));
      assert.ok(revoke.indexOf("await finishDisconnect(confirmed)") > finalConfirmation);
      assert.match(revoke.slice(finalConfirmation, revoke.indexOf("if (disconnectAfter)")), /throw new Error/);
    } else includes(revoke, ["address !== stored.user", "await refreshMandate(next)", "Spending is off. Now click Disconnect wallet"]);
    includes(app, ['role="dialog" aria-modal="true"', "stored?.revokeTx"]);
    assert.match(ui, /Spending turned off/);
  });

  test(`${surface}: trustline readiness and saved mandate identity preserve the current release`, () => {
    assert.match(app, /already\.\*trustline\|trustline\.\*already/i);
    assert.match(app, /USDC is already ready in your wallet\./);
    assert.match(ui, /usdcReady \? "USDC is ready" : "Add USDC to wallet"/);
    includes(app, ["schemaVersion: 2", "registryId: config.mandateRegistryId", "releaseFingerprint: config.releaseFingerprint", "id: registration.mandateId", "credentialHash: intent.id"]);
  });

  test(`${surface}: recovery returns paid results without an automatic second payment`, () => {
    includes(thread, ["Checking previous payment", "No automatic second payment will be sent", "parseRecovery", "invalid retained settlement evidence", "Check payment"]);
    if (surface === "wallet") {
      includes(thread, ["Recover result — no new charge", "purchaseResultForMandate(pending.result, mandateId, pending.txHash)"]);
      assert.match(thread, /setResult\(paidResult\)[\s\S]*setState\("success"\)/);
    } else {
      includes(thread, ["Recover report — no new charge", "if (isPurchaseResult(pending.result))"]);
      assert.match(thread, /setResult\(pending\.result\)[\s\S]*setState\("success"\)/);
    }
  });

  test(`${surface}: reports expose contract, marketplace, registration, and allowance proofs`, () => {
    includes(app, ["<PurchaseReport", "registrationTx={stored?.registrationTx}", "allowanceTx={stored?.allowanceTx}"]);
    includes(ui, ["ACKRATE CONTRACT", "AGENT402 x402", "Read the cited report", "Open service output", "View transaction"]);
    includes(thread, ["Mandate registration", "USDC allowance", "Agent402 x402", "Stellar Explorer", 'className="research-brief report-document"', "report-rail report-proof-rail"]);
    const editorial = surface === "wallet" ? read("components/wallet/ReportEditorial.tsx") : thread;
    includes(editorial, ["Research sources", "report-rail report-source-rail", "TWO-MODEL REVIEW"]);
  });

  test(`${surface}: rendering matches the page presentation`, () => {
    if (surface === "wallet") {
      assert.doesNotMatch(app, /ProtocolWorld|MarketplaceOrb|rotateY|<canvas/);
      includes(app, ["wallet-flow wallet-flat", "<ShieldCheck size={19}"]);
      const layout = read("app/wallet/layout.tsx");
      assert.ok(layout.indexOf('import "./wallet-flat.css"') > layout.indexOf('import "./wallet-flow.css"'));
      const flat = read("app/wallet/wallet-flat.css");
      includes(flat, ['font-family: "Wallet Geist"', "background: #000", "position: static", "repeat(3, minmax(0, 1fr))", ":focus-visible"]);
      assert.doesNotMatch(flat, /radial-gradient|linear-gradient|translateZ|rotateY/);
      return;
    }
    const world = read(`components/${surface}/ProtocolWorld.tsx`);
    includes(world, ["WebGPURenderer", '"gpu" in navigator', "new THREE.WebGLRenderer", "ResizeObserver", "IntersectionObserver", "document.hidden", "reducedMotion", "setPointerCapture", 'removeEventListener("pointerdown"', "resources.forEach((resource) => resource.dispose())", "renderer!.dispose()"]);
  });
}

test("wallet search prefills the editable Stellar question with published optional fields collapsed", () => {
  const service = FALLBACK_MARKETPLACE_SERVICES.find((candidate) => candidate.id === "search")!;
  const values = initialServiceInputValues(service);
  assert.equal(values.q, "What is Stellar?");
  const markup = renderToStaticMarkup(createElement(ServiceConfigurator, { service, values, executable: true, onChange() {}, onBack() {}, onContinue() {} }));
  includes(markup, ['aria-label="What are you searching for?"', 'placeholder="What is Stellar?"', '<details class="service-parameters">', "<summary>Advanced options"]);
  assert.doesNotMatch(markup, /<details[^>]* open/);
  assert.deepEqual(serializedServiceInputs(service, { q: "What is Stellar?", count: "", freshness: "" }), { q: "What is Stellar?" });
});

test("wallet PDF services show a required URL and preserve the submitted value", () => {
  for (const id of ["pdf", "pdf-info"]) {
    const service = FALLBACK_MARKETPLACE_SERVICES.find((candidate) => candidate.id === id)!;
    const values = { url: "https://example.com/paper.pdf" };
    const markup = renderToStaticMarkup(createElement(ServiceConfigurator, { service, values, executable: true, onChange() {}, onBack() {}, onContinue() {} }));
    includes(markup, ['type="url"', "Required"]);
    assert.doesNotMatch(markup, /<details/);
    assert.deepEqual(serializedServiceInputs(service, values), values);
  }
});

test("wallet Run uses the chat runtime with one explicit request identity and no automatic continuation", () => {
  const thread = read("components/wallet/AssistantThread.tsx");
  includes(thread, ["new AssistantChatTransport", 'api: "/api/wallet/chat"', "return { mandateId, ...submittedRun.current }", "requestId: crypto.randomUUID()", "sourceId, parameters: submittedParameters, quoteToken", "sendAutomaticallyWhen: () => false", "runtime.thread.append", "onRunStarted?.()", "<ThreadPrimitive.Messages>", "<MessagePrimitive.Parts", "purchase_source: PurchaseTool"]);
  assert.doesNotMatch(thread, /fetch\("\/api\/wallet\/purchase"/);
  includes(thread, ['state === "error" ? checkRecovery : createReport', 'onClick={() => onPurchaseComplete(result)}', "Open result", "No automatic second payment will be sent"]);
  assert.doesNotMatch(thread, /publishedTx\.current/);
});

test("wallet chat accepts only the selected service's confirmed tool output from this user turn", () => {
  const mandateId = "a".repeat(64);
  const sourceId = "agent402-research";
  const purchase: PurchaseResult = {
    source: { id: sourceId, title: "Web search" },
    payment: { status: "settled", amount: "0.02", asset: "USDC", txHash: "b".repeat(64), mandateId },
    delivered: { output: "Purchased evidence" },
  };
  const user = { role: "user" as const, content: [{ type: "text" as const, text: "What is Stellar?" }] };
  const tool = { type: "tool-call" as const, toolName: "purchase_source", toolCallId: "paid-1", args: {}, argsText: "{}", result: purchase };
  const assistant = { role: "assistant" as const, content: [tool] };
  assert.equal(confirmedPurchaseFromMessages([user, assistant], mandateId, sourceId), purchase);
  assert.equal(confirmedPurchaseFromMessages([user, assistant, user], mandateId, sourceId), null);
  assert.equal(confirmedPurchaseFromMessages([assistant], mandateId, sourceId), null);
  assert.equal(confirmedPurchaseFromMessages([user, assistant], "c".repeat(64), sourceId), null);
  assert.equal(confirmedPurchaseFromMessages([user, assistant], mandateId, "agent402-pdf"), null);
  assert.equal(confirmedPurchaseFromMessages([user, assistant], mandateId, null), null);
  for (const changed of [
    { ...tool, isError: true },
    { ...tool, toolName: "made_up_payment" },
    { ...tool, result: { ...purchase, payment: { ...purchase.payment, txHash: "not-a-transaction" } } },
    { ...tool, result: { ...purchase, payment: { ...purchase.payment, status: "pending" } } },
  ]) assert.equal(confirmedPurchaseFromMessages([user, { role: "assistant", content: [changed] }], mandateId, sourceId), null);
  assert.equal(confirmedPurchaseFromMessages([user, { role: "assistant", content: [{ type: "text", text: JSON.stringify(purchase) }] }], mandateId, sourceId), null);
});

test("an expired wallet limit retains the chat and read-only receipt recovery", () => {
  const markup = renderToStaticMarkup(createElement(AssistantThread, {
    mandateId: "a".repeat(64), asset: "USDC", canRun: false, explorerNetwork: "public", onPurchaseComplete() {},
  }));
  includes(markup, ["This limit cannot make another payment. Existing receipts remain recoverable.", "Checking previous payment"]);
  const thread = read("components/wallet/AssistantThread.tsx");
  assert.match(thread, /state !== "idle" \|\| !canRun/);
  assert.match(thread, /"\/api\/wallet\/purchase\/recovery"/);
});

test("experimental retains its authored stages and restricts navigation to reachable locations", () => {
  const app = read("components/experimental/WalletChatApp.tsx");
  for (const name of ["ConnectStage", "MarketplaceStage", "ConfigureStage", "LimitStage", "RunStage", "ProofStage"]) assert.ok(app.includes(`<${name}`));
  includes(app, ["<ProtocolWorld signals={worldSignals}", 'className="hall-report"']);
  includes(read("components/experimental/RouteRail.tsx"), ["reachable.includes(location.stage)", "disabled={!clickable}", 'aria-current={state === "current" ? "step" : undefined}']);
  assert.match(read("components/experimental/ProtocolWorld.tsx"), /hall\.dispose\(\)/);
});

test("catalog discovery fetches authenticated Stellar pricing and input schemas", () => {
  includes(read("app/api/wallet/marketplace/services/route.ts"), ["https://agent402.tools/api/pricing", "https://agent402.tools/api/find", "parseMarketplaceFind", "stellar:pubnet", "requireSession", "verified-fallback"]);
});

test("allowance signing avoids relay preparation before the popup and recovers pending submission", () => {
  const client = read("lib/wallet/mandate-client.ts");
  const prepare = section(client, "export async function prepareAllowanceTransaction", "export async function submitPreparedAllowanceWithFreighter");
  assert.match(client, /Keep signing as the first asynchronous action/);
  assert.doesNotMatch(prepare, /server\.getLatestLedger\(\)/);
  assert.match(prepare, /latestLedgerSequence\(config\)/);
  includes(client, ['method: "getLatestLedger"', "APPROVAL_TIMEBOUND_SECONDS = 10 * 60", 'submitted.status === "TRY_AGAIN_LATER"', 'submitted.status === "PENDING" || submitted.status === "DUPLICATE"']);
});

test("wallet transaction assembly uses bounded authenticated same-origin Stellar relays", () => {
  includes(read("lib/wallet/app-config.ts"), ["contractAuthorityAddress = release.release.authorityAccount", "${appOrigin}/api/wallet/rpc"]);
  assert.match(read("lib/wallet/horizon-account.ts"), /"\/api\/wallet\/account\/sequence"/);
  assert.match(read("lib/wallet/mandate-client.ts"), /installMainnetRpcRetry\(config\.network\)/);
  includes(read("app/api/wallet/rpc/route.ts"), ["requireSession", "config.network.rpcUrl", "postRpcWithRetryAndConsume", "boundedResponseJson(response, 8 * 1024 * 1024)", "compactWalletRpcResponse(body.method, upstream.status, upstream.raw)", "MAINNET_RPC_FALLBACK"]);
});

test("purchase and recovery routes enforce session and input checks independently of the model", () => {
  const purchase = read("app/api/wallet/purchase/route.ts");
  includes(purchase, ["parameters: z.record", "z.string().max(4_000)", "purchaseCatalogItem", "requireSession"]);
  assert.doesNotMatch(purchase, /openai|anthropic|streamText/i);
  includes(read("app/api/wallet/purchase/recovery/route.ts"), ["getPendingCatalogRecovery", "recoverPendingCatalogPurchase", "requireSession", "requireSameOrigin"]);
});

test("Agent402 relay readiness is checked before contract-funded execution", () => {
  const purchase = read("lib/wallet/purchase.ts");
  assert.match(read("lib/wallet/app-config.ts"), /networkName === "mainnet" \? agentAddress : configuredMerchantAddress/);
  assert.ok(purchase.indexOf("await preflightAgent402Tool") >= 0);
  assert.ok(purchase.indexOf("await preflightAgent402Tool") < purchase.indexOf("await ensureAgentUsdcTrustline"));
  assert.ok(purchase.indexOf("await ensureAgentUsdcTrustline") < purchase.indexOf("await consumer.fetch"));
  assert.match(read("lib/wallet/fulfillment.ts"), /runAgent402Research/);
  includes(read("lib/wallet/agent402.ts"), ["createPaymentPayload", "encodePaymentSignatureHeader", "markMarketplacePaid", "stellar:pubnet"]);
});

test("V2 registration uses the contract-returned mandate id", () => {
  includes(read("lib/wallet/mandate-client.ts"), ["preparedMandateId = registeredMandateIdHex(assembled.result.unwrap())", "submittedMandateId !== preparedMandateId", "legacy credential identifier instead of a V2 mandate id"]);
  assert.match(read("lib/wallet/mandate-id.ts"), /bytes\.length !== 32/);
});

test("paid recovery reuses the receipt and report editing keeps provider independence", () => {
  includes(read("lib/wallet/purchase.ts"), ["consumer.retryDelivery(receipt", "await consumer.acknowledgeDelivery(receipt)", "latestSucceededToolCall"]);
  assert.match(read("lib/wallet/fulfillment.ts"), /marketplace: marketplaceResult\?\.marketplace/);
  assert.match(read("lib/wallet/market-brief.ts"), /attachMarketBriefToPurchaseResult/);
  includes(read("lib/wallet/marketplace-report.ts"), ["excludeProviderId: firstPass.providerId", "editorialPasses = 2"]);
});
