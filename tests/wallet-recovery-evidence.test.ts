import assert from "node:assert/strict";
import test from "node:test";
import { parseRecovery } from "../components/wallet/AssistantThread";

test("recovery evidence exposes only a canonical settlement hash", () => {
  const txHash = "a".repeat(64);
  assert.deepEqual(parseRecovery({ pending: true, txHash, amount: "0.01", asset: "USDC" }), {
    pending: true,
    txHash,
    amount: "0.01",
    asset: "USDC",
  });
  assert.equal(parseRecovery({ pending: false }), null);
});

test("malformed or ambiguous recovery evidence fails closed", () => {
  for (const value of [undefined, null, {}, { pending: true }, { pending: true, txHash: "abc" }, { pending: "true", txHash: "a".repeat(64) }]) {
    assert.throws(() => parseRecovery(value), /invalid (?:recovery status|retained settlement evidence)/);
  }
});
