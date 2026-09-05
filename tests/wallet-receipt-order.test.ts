import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createSettlementReceiptId, type SettlementReceipt } from "@ackrate/core";
import { restoreReceiptKeyOrder } from "../lib/wallet/receipt-order";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Reorder object keys the way Postgres jsonb does: length, then bytes. */
function jsonbShuffle(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonbShuffle);
  if (typeof value !== "object" || value === null) return value;
  const source = value as Record<string, unknown>;
  const keys = Object.keys(source).sort((a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(keys.map((key) => [key, jsonbShuffle(source[key])]));
}

function boundReceipt(): SettlementReceipt {
  const challenge = {
    proofVersion: 2 as const,
    challengeId: "a".repeat(43),
    audience: "https://agent402.tools",
    scheme: "ackrate-soroban",
    method: "GET",
    resource: "https://agent402.tools/api/search",
    bodySha256: null,
    network: "stellar-mainnet",
    networkId: "b".repeat(64),
    registryId: "CCLZEBJXG4YVJEPBCR5F27N733BCK5HQJWZZGB3K54JVODY3VAGP4HWR",
    merchant: "GAGENT402EXAMPLEMERCHANTADDRESSFORTHISUNITTESTONLYXXXXXX",
    asset: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    amountStroops: "200000",
    decimals: 7,
    issuedAt: 1_788_600_000,
    expiresAt: 1_788_600_600,
    authorization: { algorithm: "hmac-sha256" as const, mac: "c".repeat(44) },
  };
  const proof = {
    proofVersion: 2 as const,
    scheme: challenge.scheme,
    network: challenge.network,
    txHash: "d".repeat(64),
    mandateId: "e".repeat(64),
    challenge,
    authorization: { algorithm: "stellar-ed25519-sha256" as const, signature: "f".repeat(88) },
  };
  const withoutId = {
    proofVersion: 2 as const,
    url: "https://agent402.tools/api/search?q=solana",
    method: "GET",
    txHash: proof.txHash,
    mandateId: proof.mandateId,
    amount: "0.02",
    submittedAt: 1_788_600_010,
    validUntil: 1_788_600_310,
    proof,
  };
  return { receiptId: createSettlementReceiptId(withoutId), ...withoutId };
}

function legacyReceipt(): SettlementReceipt {
  const proof = {
    scheme: "ackrate-soroban",
    network: "stellar-testnet",
    txHash: "1".repeat(64),
    mandateId: "2".repeat(64),
    amount: "0.02",
  };
  const withoutId = {
    proofVersion: 1 as const,
    url: "https://merchant.example/api/search",
    method: "GET",
    txHash: proof.txHash,
    mandateId: proof.mandateId,
    amount: "0.02",
    submittedAt: 1_788_600_010,
    validUntil: 1_788_600_310,
    proof,
  };
  return { receiptId: createSettlementReceiptId(withoutId), ...withoutId };
}

test("a receipt read back from jsonb no longer verifies against its own id", () => {
  const receipt = boundReceipt();
  const stored = jsonbShuffle(receipt) as SettlementReceipt;

  assert.notDeepEqual(Object.keys(stored.proof), Object.keys(receipt.proof));
  const recomputed = createSettlementReceiptId({
    proofVersion: stored.proofVersion,
    url: stored.url,
    method: stored.method,
    txHash: stored.txHash,
    mandateId: stored.mandateId,
    amount: stored.amount,
    submittedAt: stored.submittedAt,
    validUntil: stored.validUntil,
    proof: stored.proof,
  });
  assert.notEqual(recomputed, receipt.receiptId);
});

test("key order is restored for bound and legacy proofs and verified against the stored id", () => {
  for (const receipt of [boundReceipt(), legacyReceipt()]) {
    const restored = restoreReceiptKeyOrder(jsonbShuffle(receipt));
    assert.ok(restored, "receipt could not be restored");
    assert.equal(JSON.stringify(restored), JSON.stringify(receipt));
  }
});

test("an already-exact receipt is returned untouched", () => {
  const receipt = boundReceipt();
  assert.equal(restoreReceiptKeyOrder(receipt), receipt);
});

test("a receipt whose fields were altered is refused rather than silently repaired", () => {
  const receipt = boundReceipt();
  const tampered = jsonbShuffle({ ...receipt, amount: "9.99" });
  assert.equal(restoreReceiptKeyOrder(tampered), null);

  const extraKey = jsonbShuffle({ ...receipt, proof: { ...receipt.proof, extra: "x" } });
  assert.equal(restoreReceiptKeyOrder(extraKey), null);
  assert.equal(restoreReceiptKeyOrder(null), null);
  assert.equal(restoreReceiptKeyOrder({ receiptId: "nope" }), null);
});

test("receipts are persisted as exact JSON text, not only as jsonb", () => {
  const journal = read("lib/wallet/journal.ts");

  assert.match(journal, /ADD COLUMN IF NOT EXISTS receipt_text text/);
  assert.match(journal, /const exact = JSON\.stringify\(receipt\)/);
  assert.match(journal, /VALUES \(\$1, \$2, \$3, \$4::jsonb, \$4, \$5\)/);
  assert.match(journal, /receipt_text = EXCLUDED\.receipt_text/);
  assert.match(journal, /SELECT receipt, receipt_text FROM ackrate_payment_receipts/);
  assert.match(journal, /restoreReceiptKeyOrder\(record\.receipt\)/);
});
