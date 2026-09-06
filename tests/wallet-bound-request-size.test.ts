import assert from "node:assert/strict";
import test from "node:test";
import { encodePaymentProof, decodePaymentProof, type BoundPaymentProofV2 } from "@ackrate/core";
import { StrKey } from "@stellar/stellar-sdk";
import { assertBoundPaymentRequestSize, MAX_BOUND_PAYMENT_HEADER_BYTES } from "../lib/wallet/delivery-result";
import { agent402InternalQuery, normalizeAgent402ToolInput, SUPPORTED_AGENT402_TOOLS } from "../lib/wallet/agent402-tools";

const fields = {
  registry: StrKey.encodeContract(Buffer.alloc(32, 1)),
  merchant: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2)),
  asset: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
  amountAtomic: "200000", decimals: 7, network: "stellar-mainnet",
};

// Public, non-authenticating wire fixture. Nothing is signed or submitted.
function proofFor(url: string): BoundPaymentProofV2 {
  const target = new URL(url);
  return {
    proofVersion: 2, scheme: "ackrate-soroban-bound", network: fields.network,
    txHash: "a".repeat(64), mandateId: "b".repeat(64),
    challenge: {
      proofVersion: 2, challengeId: Buffer.alloc(32).toString("base64url"),
      audience: target.origin, scheme: "ackrate-soroban-bound", method: "GET",
      resource: `${target.pathname}${target.search}`, bodySha256: null,
      network: fields.network, networkId: "c".repeat(64), registryId: fields.registry,
      merchant: fields.merchant, asset: fields.asset, amountStroops: fields.amountAtomic,
      decimals: fields.decimals, issuedAt: 1_788_600_000, expiresAt: 1_788_600_900,
      authorization: { algorithm: "hmac-sha256", mac: Buffer.alloc(32).toString("base64") },
    },
    authorization: { algorithm: "stellar-ed25519-sha256", signature: Buffer.alloc(64).toString("base64") },
  };
}

test("ordinary quoted requests fit the installed bound payment header limit without signing", (t) => {
  const noNetwork = t.mock.method(globalThis, "fetch", async () => { throw new Error("offline wire check cannot access the network"); });
  const url = new URL("https://reapp.live/api/wallet/source/agent402-research");
  url.searchParams.set("q", "What is Stellar?");
  url.searchParams.set("count", "10");
  url.searchParams.set("_quote", "q".repeat(1800));
  assert.doesNotThrow(() => assertBoundPaymentRequestSize({ ...fields, url: url.toString() }));
  const header = encodePaymentProof(proofFor(url.toString()));
  assert.ok(Buffer.byteLength(header) <= MAX_BOUND_PAYMENT_HEADER_BYTES);
  assert.deepEqual(decodePaymentProof(header), proofFor(url.toString()));
  assert.equal(noNetwork.mock.callCount(), 0);
});

test("every accepted boundary request fits the actual SDK encoder", () => {
  const prefix = "https://reapp.live/api/wallet/source/agent402-research?q=";
  let greatestAccepted = 0;
  for (let length = 0; length < 7000; length++) {
    const url = prefix + "x".repeat(length);
    try {
      assertBoundPaymentRequestSize({ ...fields, url });
      greatestAccepted = length;
    } catch {
      break;
    }
  }
  assert.ok(greatestAccepted > 3000);
  const accepted = prefix + "x".repeat(greatestAccepted);
  assert.ok(Buffer.byteLength(encodePaymentProof(proofFor(accepted))) <= MAX_BOUND_PAYMENT_HEADER_BYTES);
  assert.throws(() => assertBoundPaymentRequestSize({ ...fields, url: prefix + "x".repeat(greatestAccepted + 1) }), /No new payment was sent/);
});

test("valid PDF parameters whose query encoding inflates the proof fail before payment", () => {
  const tool = SUPPORTED_AGENT402_TOOLS.pdf;
  const parameters = normalizeAgent402ToolInput("pdf", { url: `https://example.com/${"&".repeat(1900)}.pdf` });
  // Re-normalization also succeeds: this is not merely an invalid input caught elsewhere.
  assert.deepEqual(normalizeAgent402ToolInput("pdf", parameters), parameters);
  const url = new URL("https://reapp.live/api/wallet/source/agent402-pdf");
  url.search = agent402InternalQuery(tool, parameters).toString();
  url.searchParams.set("_quote", "q".repeat(1200));
  assert.ok(Buffer.byteLength(encodePaymentProof(proofFor(url.toString()))) > MAX_BOUND_PAYMENT_HEADER_BYTES);
  assert.throws(() => assertBoundPaymentRequestSize({ ...fields, amountAtomic: tool.amountAtomic, url: url.toString() }), /shorter question or PDF URL/);
});
