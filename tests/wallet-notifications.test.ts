import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { nextWalletNotification, safeWalletError } from "../lib/wallet/notifications";

test("one notification replaces stale status and does not reveal a hidden previous error", () => {
  const old = nextWalletNotification(null, "notice", "Opening wallet");
  const failed = nextWalletNotification(old, "error", "Wallet request failed");
  assert.deepEqual(failed, { kind: "error", message: "Wallet request failed" });
  assert.equal(nextWalletNotification(failed, "error", null), null);
  assert.equal(nextWalletNotification(failed, "notice", null), failed);
  const ready = nextWalletNotification(failed, "notice", "Ready");
  assert.deepEqual(ready, { kind: "notice", message: "Ready" });
  assert.equal(nextWalletNotification(ready, "notice", null), null);
});

test("known notification causes produce actionable text without echoing server payloads", () => {
  const cases = [
    ["invalid API key sk-example-secret", /operator attention/],
    ["429 too many requests bearer=secret", /service is busy/],
    ["wallet-authenticated session required", /same wallet/],
    ["Freighter signing cancelled", /cancelled/],
    ["different signer", /same wallet/],
    ["wrong network", /Stellar Mainnet/],
    ["quote recipient changed", /price and seller/],
    ["BudgetExceeded", /cannot cover another service/],
    ["mandate has expired", /receipts remain recoverable/],
    ["url input required", /required service inputs/],
    ["fetch failed ECONNRESET", /connection was interrupted/],
  ] as const;
  for (const [cause, expected] of cases) {
    const message = safeWalletError(new Error(cause), "Try the action below.");
    assert.match(message, expected);
    assert.doesNotMatch(message, /sk-example|bearer=|secret|ECONNRESET/);
  }
  assert.equal(safeWalletError(new Error("unknown error with token=private"), "Unable to continue."), "Unable to continue.");
  assert.equal(safeWalletError({ error: "private" }, "Unable to continue."), "Unable to continue.");
});

test("wallet toast is readable, dismissible, announces status and expires only non-error feedback", () => {
  const app = readFileSync(new URL("../components/wallet/WalletChatApp.tsx", import.meta.url), "utf8");
  assert.match(app, /notification\.kind === "error" \|\| notificationBusy\) return/);
  assert.match(app, /current === notification \? null : current\), 8_000/);
  assert.match(app, /aria-label="Dismiss notification"/);
  assert.match(app, /fontSize: 13/);
  assert.match(app, /role=\{failed \? "alert" : "status"\} aria-atomic="true"/);
  assert.doesNotMatch(app, /error \?\? notice|Could not finish setup\. Open Freighter/);
  assert.match(app, /submitted\.pendingAllowance\s*\? "The allowance was signed, but confirmation has not finished/);
});

test("chat failures keep saved results available, hide arbitrary recovery messages and offer one recovery action", () => {
  const app = readFileSync(new URL("../components/wallet/AssistantThread.tsx", import.meta.url), "utf8");
  assert.match(app, /Your service result is saved\. The chat summary was interrupted/);
  assert.match(app, /role=\{result \? "status" : "alert"\}/);
  assert.match(app, /safeWalletError\(chatError/);
  assert.doesNotMatch(app, /setError\(pending\.message\)|setError\(message\)/);
  assert.doesNotMatch(app, /onClick=\{checkRecovery\}>Check payment<\/button>/);
  assert.match(app, /No automatic second payment will be sent/);
});
