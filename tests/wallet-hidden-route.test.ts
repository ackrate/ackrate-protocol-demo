import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("wallet route is listed in the primary nav but excluded from search discovery", () => {
  const navigation = read("components/Nav.tsx");
  const sitemap = read("app/sitemap.ts");
  const robots = read("app/robots.ts");
  const layout = read("app/wallet/layout.tsx");

  assert.equal(navigation.includes('{ href: "/wallet"'), true);
  assert.equal(sitemap.includes('"/wallet"'), false);
  assert.match(robots, /disallow: \["\/api\/", "\/wallet"\]/);
  assert.match(layout, /index: false/);
  assert.match(layout, /follow: false/);
});

test("wallet browser calls stay inside the isolated API namespace", () => {
  const app = read("components/wallet/WalletChatApp.tsx");
  const thread = read("components/wallet/AssistantThread.tsx");

  assert.doesNotMatch(app, /"\/api\/(?:auth|config|mandate)/);
  assert.match(app, /"\/api\/wallet\/auth\/challenge"/);
  assert.match(app, /"\/api\/wallet\/mandate\/status"/);
  assert.match(thread, /api: "\/api\/wallet\/chat"/);
});

test("connecting Freighter never creates or signs a Mainnet transaction", () => {
  const app = read("components/wallet/WalletChatApp.tsx");
  const connectStart = app.indexOf("const connect = async () =>");
  const authenticateStart = app.indexOf("const authenticate = async () =>");
  const activateStart = app.indexOf("const activate = async () =>");

  assert.ok(connectStart >= 0 && authenticateStart > connectStart && activateStart > authenticateStart);
  const connectSource = app.slice(connectStart, authenticateStart);
  const authenticateSource = app.slice(authenticateStart, activateStart);
  assert.match(connectSource, /connectFreighter/);
  assert.doesNotMatch(connectSource, /auth\/challenge|signFreighterTransaction/);
  assert.match(authenticateSource, /auth\/challenge/);
  assert.match(authenticateSource, /signFreighterTransaction/);
  assert.match(app, /Connecting does not create, sign, or send a Mainnet transaction/);
});

test("wallet marketplace step selects the external Stellar service without moving funds", () => {
  const app = read("components/wallet/WalletChatApp.tsx");
  const orb = read("components/wallet/MarketplaceOrb.tsx");
  const styles = read("app/wallet/wallet-flow.css");
  const catalogRoute = read("app/api/wallet/marketplace/services/route.ts");

  assert.match(app, /https:\/\/agent402\.tools\/stellar/);
  assert.match(app, /STEP 2 OF 5/);
  assert.match(app, /Search web, research, scraper, PDF/);
  assert.match(app, /marketplaceDraft\.name/);
  assert.match(app, /changeMarketplaceService/);
  assert.match(app, /JSON\.stringify\(marketplaceDraft\)/);
  assert.match(app, /\/api\/wallet\/marketplace\/services\?q=/);
  assert.match(app, /Choosing a service does not move funds/);
  assert.match(catalogRoute, /https:\/\/agent402\.tools\/api\/pricing/);
  assert.match(catalogRoute, /stellar:pubnet/);
  assert.match(catalogRoute, /requireSession/);
  assert.match(catalogRoute, /verified-fallback/);
  assert.match(app, /AnimatePresence/);
  assert.match(app, /useReducedMotion/);
  assert.match(app, /MarketplaceOrb variant="brand"/);
  assert.match(app, /MarketplaceOrb variant="stage"/);
  assert.doesNotMatch(app, /className="flow-brand"><span>R<\/span>/);
  assert.match(orb, /new THREE\.WebGLRenderer/);
  assert.match(orb, /ResizeObserver/);
  assert.match(orb, /prefers-reduced-motion: reduce/);
  assert.match(orb, /renderer\.dispose\(\)/);
  assert.match(styles, /min-height: calc\(100svh - 52px\)/);
  assert.match(styles, /marketplace-orb\.brand-orb/);
});

test("wallet keeps the contract governance multisig separate from consumer setup", () => {
  const app = read("components/wallet/WalletChatApp.tsx");
  const config = read("lib/wallet/app-config.ts");

  assert.match(config, /contractAuthorityAddress = release\.release\.authorityAccount/);
  assert.match(app, /walletAddress === config\.contractAuthorityAddress/);
  assert.match(app, /session\.address === config\.contractAuthorityAddress/);
  assert.match(app, /Contract account detected/);
  assert.match(app, /This 2-of-3 account protects the contract/);
  assert.match(app, /Use a separate personal Mainnet wallet/);
  assert.match(app, /mandateBusy \|\| governanceWalletConnected/);
});

test("wallet transaction assembly uses authenticated same-origin Stellar relays", () => {
  const config = read("lib/wallet/app-config.ts");
  const account = read("lib/wallet/horizon-account.ts");
  const rpc = read("app/api/wallet/rpc/route.ts");

  assert.match(config, /\$\{appOrigin\}\/api\/wallet\/rpc/);
  assert.match(account, /"\/api\/wallet\/account\/sequence"/);
  assert.match(rpc, /requireSession/);
  assert.match(rpc, /config\.network\.rpcUrl/);
  assert.match(read("lib/wallet/mandate-client.ts"), /installMainnetRpcRetry\(config\.network\)/);
});

test("wallet RPC relay bounds, compacts, and fails over Mainnet responses", () => {
  const source = read("app/api/wallet/rpc/route.ts");
  assert.match(source, /postRpcWithRetryAndConsume/);
  assert.match(source, /boundedResponseJson\(response, 8 \* 1024 \* 1024\)/);
  assert.match(source, /compactWalletRpcResponse\(body\.method, upstream\.status, upstream\.raw\)/);
  assert.match(source, /MAINNET_RPC_FALLBACK/);
});

test("wallet exposes a deterministic real-payment control without an LLM dependency", () => {
  const thread = read("components/wallet/AssistantThread.tsx");
  const purchase = read("app/api/wallet/purchase/route.ts");
  const recovery = read("app/api/wallet/purchase/recovery/route.ts");

  assert.match(thread, /Pay \$0\.01 and get the report/);
  assert.match(thread, /"\/api\/wallet\/purchase"/);
  assert.match(purchase, /purchaseCatalogItem/);
  assert.match(purchase, /requireSession/);
  assert.doesNotMatch(purchase, /openai|anthropic|streamText/i);
  assert.match(recovery, /getPendingCatalogRecovery/);
  assert.match(recovery, /recoverPendingCatalogPurchase/);
  assert.match(recovery, /requireSession/);
  assert.match(recovery, /requireSameOrigin/);
  assert.match(thread, /Get my report — no new charge/);
  assert.match(thread, /Pay \$0\.01 and get the report/);
  assert.match(thread, /Checking your last payment/);
  assert.match(thread, /View transaction/);
  assert.match(thread, /You will not pay again/);
  assert.match(thread, /parseRecovery/);
  assert.match(thread, /invalid retained settlement evidence/);
  assert.match(thread, /Tap Check payment before trying to pay/);
  assert.match(read("components/wallet/WalletChatApp.tsx"), /View transaction/);
});

test("wallet closes an expired mandate locally and offers a fresh boundary", () => {
  const app = read("components/wallet/WalletChatApp.tsx");

  assert.match(app, /mandate\.expiry > nowSeconds/);
  assert.match(app, /setInterval\(\(\) => setNowSeconds/);
  assert.match(app, /!currentMandate/);
  assert.match(app, /Approve spending limit/);
});

test("wallet hydration cannot create a mandate-status request loop", () => {
  const app = read("components/wallet/WalletChatApp.tsx");

  assert.match(app, /useCallback\(async \(current: StoredMandate\)/);
  assert.match(app, /if \(parsed\.registrationTx\) void refreshMandate\(parsed\)/);
  assert.match(app, /if \(stored\) void refreshMandate\(stored\)/);
  assert.doesNotMatch(app, /const current = candidate \?\? stored/);
  assert.doesNotMatch(app, /}, \[stored\]\);/);
});

test("wallet shows clear progress while Mainnet approval is prepared", () => {
  const app = read("components/wallet/WalletChatApp.tsx");
  const styles = read("app/wallet/wallet.css");

  assert.match(app, /Saving your limit/);
  assert.match(app, /Preparing Freighter/);
  assert.match(styles, /activation-orbit/);
  assert.match(styles, /activation-shimmer/);
});

test("wallet card exposes an obvious site disconnect control", () => {
  const app = read("components/wallet/WalletChatApp.tsx");

  assert.match(app, /Disconnect wallet/);
  assert.match(app, /Turn off spending/);
  assert.match(app, /onClick=\{\(\) => setDisconnectOpen\(true\)\}/);
  assert.match(app, /method: "DELETE"/);
  assert.match(app, /setSession\(emptySession\)/);
  assert.match(app, /session\.authenticated \? \(\) => setDisconnectOpen\(true\) : disconnect/);
});

test("wallet disconnect is blocked until the on-chain mandate is off", () => {
  const app = read("components/wallet/WalletChatApp.tsx");

  assert.match(app, /mandate\?\.status === "Active" && mandate\.expiry > Math\.floor\(Date\.now\(\) \/ 1_000\)/);
  assert.match(app, /First tap Turn off spending below\. Then disconnect your wallet/);
  assert.match(app, /className="wallet-pill" onClick=\{session\.authenticated \? \(\) => setDisconnectOpen\(true\) : disconnect\}/);
  assert.match(app, /Tap Disconnect wallet\. Ackrate will guide you through both steps/);
  assert.match(app, /Spending is off\. Now click Disconnect wallet/);
  assert.match(app, /const spendingOff = Boolean\(stored\?\.revokeTx && mandate\?\.status !== "Active"\)/);
  assert.match(app, /spendingOff \? "SPENDING IS OFF"/);
  assert.match(app, /spendingOff \? "Finish by disconnecting\."/);
  assert.match(app, /className="disconnect-button locked-action"/);
});

test("wallet labels reflect the connected and spending-off states", () => {
  const app = read("components/wallet/WalletChatApp.tsx");

  assert.match(app, /session\.authenticated \? "Verified" : walletAddress \? "Connected — verify next" : "Connect — no transaction"/);
  assert.match(app, /spendingOff \? "Turned off"/);
  assert.match(app, /session\.authenticated \? "Your wallet is connected\." : "Connect your wallet first\."/);
});

test("an existing USDC trustline is shown as ready instead of an error", () => {
  const app = read("components/wallet/WalletChatApp.tsx");

  assert.match(app, /already\.\*trustline\|trustline\.\*already/i);
  assert.match(app, /USDC is already ready in your wallet\./);
  assert.match(app, /usdcReady \? "USDC is ready" : "Add USDC to wallet"/);
});

test("turning off reconnects and verifies the exact Freighter account before signing", () => {
  const app = read("components/wallet/WalletChatApp.tsx");

  assert.match(app, /const address = await connectFreighter\(config\.networkPassphrase\)/);
  assert.match(app, /if \(address !== stored\.user\) throw new Error\("Select the same wallet you connected to Ackrate"\)/);
  assert.match(app, /role="dialog" aria-modal="true"/);
  assert.match(app, /First, turn off spending/);
  assert.match(app, /Ready to disconnect/);
});

test("confirmed disconnect clears only Ackrate wallet setup and purchase state", () => {
  const app = read("components/wallet/WalletChatApp.tsx");

  assert.doesNotMatch(app, /auth\/session"[\s\S]{0,100}\.catch\(\(\) => undefined\)/);
  assert.match(app, /localStorage\.removeItem\(mandateStorageKey\(config, session\.address\)\)/);
  assert.match(app, /localStorage\.removeItem\(legacyMandateStorageKey\(config, session\.address\)\)/);
  assert.match(app, /localStorage\.removeItem\("ackrate:mainnet:last-payment"\)/);
  assert.match(app, /Wallet disconnected\. Connect a wallet to start again/);
  assert.match(app, /Could not disconnect\. Please try again/);
});

test("wallet stores the V2 contract-returned id and rejects stale release state", () => {
  const app = read("components/wallet/WalletChatApp.tsx");
  const client = read("lib/wallet/mandate-client.ts");
  const mandateId = read("lib/wallet/mandate-id.ts");

  assert.match(client, /preparedMandateId = registeredMandateIdHex\(assembled\.result\.unwrap\(\)\)/);
  assert.match(mandateId, /bytes\.length !== 32/);
  assert.match(client, /submittedMandateId !== preparedMandateId/);
  assert.match(client, /legacy credential identifier instead of a V2 mandate id/);
  assert.match(app, /schemaVersion: 2/);
  assert.match(app, /registryId: config\.mandateRegistryId/);
  assert.match(app, /releaseFingerprint: config\.releaseFingerprint/);
  assert.match(app, /id: registration\.mandateId/);
  assert.match(app, /credentialHash: intent\.id/);
});

test("every wallet transaction has a visible explorer link", () => {
  const app = read("components/wallet/WalletChatApp.tsx");
  const thread = read("components/wallet/AssistantThread.tsx");

  assert.match(app, /TransactionEvidence label="Spending limit"/);
  assert.match(app, /TransactionEvidence label="USDC approval"/);
  assert.match(app, /TransactionEvidence label="Spending turned off"/);
  assert.match(app, /View transaction/);
  assert.match(thread, /View transaction/);
});

test("a paid report renders below the workspace with side rails for proof and sources", () => {
  const app = read("components/wallet/WalletChatApp.tsx");
  const thread = read("components/wallet/AssistantThread.tsx");
  const fulfillment = read("lib/wallet/fulfillment.ts");
  const brief = read("lib/wallet/market-brief.ts");

  assert.match(thread, /className="research-brief report-document"/);
  assert.match(thread, /THE TAKEAWAY/);
  assert.match(thread, /Research sources/);
  assert.match(thread, /report-rail report-proof-rail/);
  assert.match(thread, /report-rail report-source-rail/);
  assert.match(thread, /Your report is ready/);
  assert.match(thread, /View spending limit/);
  assert.match(thread, /View USDC approval/);
  assert.match(app, /<PurchaseReport/);
  assert.ok(app.indexOf('className="workspace shell"') < app.indexOf("<PurchaseReport"));
  assert.match(fulfillment, /brief: item\.id === "market-brief" \? MARKET_SIGNAL_BRIEF/);
  assert.match(brief, /github\.com\/futurehelp\/query402-api/);
  assert.match(brief, /developers\.stellar\.org\/docs\/tokens\/stellar-asset-contract/);
});

test("a retained paid report opens automatically without contacting the merchant again", () => {
  const thread = read("components/wallet/AssistantThread.tsx");
  const purchase = read("lib/wallet/purchase.ts");

  assert.match(thread, /const paidResult = isPurchaseResult\(pendingRecovery\.result\)/);
  assert.match(thread, /setResult\(paidResult\)[\s\S]*setState\("success"\)/);
  assert.match(thread, /isPurchaseResult\(pendingRecovery\.result\)/);
  assert.match(purchase, /if \(item\.id === "market-brief"\)/);
  assert.match(purchase, /result: item\.id === "market-brief" \? builtInReportResult/);
  assert.match(purchase, /await receiptStore\.clearPending\(receipt\.receiptId\)/);
});

test("wallet journey uses plain action language", () => {
  const app = read("components/wallet/WalletChatApp.tsx");
  const thread = read("components/wallet/AssistantThread.tsx");

  for (const label of ["Connect wallet", "Set a spending limit", "Approve spending limit", "Pay $0.01 and get the report", "Turn off spending", "Disconnect wallet"]) {
    assert.match(`${app}\n${thread}`, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(app, /Mandate control room|Freighter authority|Authenticated account|Set the boundary|Active mandate|Revoke authority|Spending envelope|Verifiable by default/);
  assert.doesNotMatch(thread, /MANDATE ONLINE|Your agent has boundaries|Settlement status could not be confirmed|Get my brief — already paid/);
});
