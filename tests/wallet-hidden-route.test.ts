import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("wallet route is unlisted and excluded from discovery surfaces", () => {
  const navigation = read("components/Nav.tsx");
  const sitemap = read("app/sitemap.ts");
  const robots = read("app/robots.ts");
  const layout = read("app/wallet/layout.tsx");

  assert.equal(navigation.includes('{ href: "/wallet"'), false);
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

  assert.match(thread, /Pay \$0\.01 and get the brief/);
  assert.match(thread, /"\/api\/wallet\/purchase"/);
  assert.match(purchase, /purchaseCatalogItem/);
  assert.match(purchase, /requireSession/);
  assert.doesNotMatch(purchase, /openai|anthropic|streamText/i);
  assert.match(recovery, /getPendingCatalogRecovery/);
  assert.match(recovery, /recoverPendingCatalogPurchase/);
  assert.match(recovery, /requireSession/);
  assert.match(recovery, /requireSameOrigin/);
  assert.match(thread, /Get my brief — already paid/);
  assert.match(thread, /Pay \$0\.01 and get the brief/);
  assert.match(thread, /Checking your last payment/);
  assert.match(thread, /See my payment on Stellar Explorer/);
  assert.match(thread, /You will not pay again/);
  assert.match(thread, /parseRecovery/);
  assert.match(thread, /invalid retained settlement evidence/);
  assert.match(thread, /Payment remains disabled/);
  assert.match(read("components/wallet/WalletChatApp.tsx"), /View transaction/);
});

test("wallet closes an expired mandate locally and offers a fresh boundary", () => {
  const app = read("components/wallet/WalletChatApp.tsx");

  assert.match(app, /mandate\.expiry > nowSeconds/);
  assert.match(app, /setInterval\(\(\) => setNowSeconds/);
  assert.match(app, /!currentMandate/);
  assert.match(app, /Sign & activate mandate/);
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

  assert.match(app, /Securing your mandate/);
  assert.match(app, /Preparing Mainnet approval/);
  assert.match(styles, /activation-orbit/);
  assert.match(styles, /activation-shimmer/);
});
