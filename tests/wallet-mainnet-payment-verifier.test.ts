import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { StrKey, xdr } from "@stellar/stellar-sdk";
import { extractContractEvents, interpretEvents, selectPayment, type DecodedEvent, type LoadedTransaction, type PaymentRequirement } from "@ackrate/express-middleware";
import { loadAppConfig } from "../lib/wallet/app-config";
import { adaptMainnetV2PaymentEvents, createMainnetV2PaymentVerifier } from "../lib/wallet/mainnet-payment-verifier";

const user = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
const relay = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2));
const other = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3));
const otherAsset = StrKey.encodeContract(Buffer.alloc(32, 4));
const config = loadAppConfig({ NODE_ENV: "test", ACKRATE_WALLET_NETWORK: "mainnet", ACKRATE_CHAT_AGENT_PUBLIC_KEY: relay });
const mandateId = Buffer.alloc(32, 5);
const txHash = "a".repeat(64);
const value = (type: string, value: unknown) => ({ type, value });
const payment: DecodedEvent = {
  type: "contract", contractId: config.public.mandateRegistryId,
  topics: [value("scvSymbol", "payment"), value("scvAddress", relay), value("scvAddress", config.public.asset.contractId)],
  data: value("scvVec", [value("scvBytes", mandateId), value("scvI128", 200000n), value("scvU32", 2)]),
};
const transfer: DecodedEvent = {
  type: "contract", contractId: config.public.asset.contractId,
  topics: [value("scvSymbol", "transfer"), value("scvAddress", user), value("scvAddress", relay)],
  data: value("scvI128", 200000n),
};
const requirement: PaymentRequirement = {
  scheme: "ackrate-soroban-bound", network: "stellar-mainnet", resource: "/api/wallet/source/agent402-research?q=Stellar",
  merchant: relay, asset: config.public.asset.contractId, amount: "0.02", amountStroops: 200000n,
  registryId: config.public.mandateRegistryId, decimals: 7,
};
const storedMandate = { user, agent: relay, merchant: relay, asset: config.public.asset.contractId, seq: 5, spent: 1000000n };

async function verify(overrides: {
  transaction?: Partial<LoadedTransaction>; mandate?: Partial<typeof storedMandate>;
  requirement?: Partial<PaymentRequirement>; passphrase?: string;
} = {}) {
  const verifier = createMainnetV2PaymentVerifier(config, {
    loadNetworkPassphrase: async () => overrides.passphrase ?? config.network.networkPassphrase,
    loadTransaction: async () => ({ status: "SUCCESS", ledger: 1000, latestLedger: 1001,
      events: [transfer, payment], ...overrides.transaction }),
    loadMandate: async (id) => { assert.deepEqual(id, mandateId); return { ...storedMandate, ...overrides.mandate }; },
  });
  return verifier.verify(txHash, { ...requirement, ...overrides.requirement });
}

test("native V2 selection requires the canonical asset and the strict adapter retains token evidence", async (t) => {
  const network = t.mock.method(globalThis, "fetch", async () => { throw new Error("Offline verifier must not access the network or submit a payment"); });
  assert.deepEqual(selectPayment([transfer, payment], { merchant: relay, registryId: requirement.registryId, priceStroops: 200000n }),
    { ok: false, reason: "V2 payment asset does not match this API" });
  const check = { merchant: relay, registryId: requirement.registryId, priceStroops: 200000n, asset: config.public.asset.contractId };
  assert.deepEqual(selectPayment([transfer, payment], check), {
    ok: true, mandateId, amount: 200000n, consumedSequence: 2,
  });
  assert.deepEqual(selectPayment([transfer, payment], { ...check, asset: otherAsset }),
    { ok: false, reason: "V2 payment asset does not match this API" });
  const adapted = adaptMainnetV2PaymentEvents([transfer, payment]);
  assert.equal(adapted.events[0], transfer, "original SAC transfer is preserved, not manufactured");
  assert.equal(adapted.payments[0]?.sequence, 2);
  const verdict = await verify();
  assert.equal(verdict.ok, true, "later valid payments (current seq 5 versus consumed 2) must not invalidate proof");
  if (verdict.ok) {
    assert.equal(verdict.payment.mandateId, mandateId.toString("hex"));
    assert.equal(verdict.payment.amountStroops, 200000n);
  }
  assert.equal(network.mock.callCount(), 0);
});

test("pinned V2 registry never accepts a legacy, malformed, wrong-asset or overflowing-sequence event", async () => {
  const originalData = payment.data.value as ReturnType<typeof value>[];
  const malformed: DecodedEvent[] = [
    { ...payment, topics: payment.topics.slice(0, 2), data: value("scvVec", originalData.slice(0, 2)) },
    { ...payment, topics: [...payment.topics.slice(0, 2), value("scvAddress", otherAsset)] },
    { ...payment, data: value("scvVec", [value("scvBytes", Buffer.alloc(31)), ...originalData.slice(1)]) },
    ...[value("scvI128", 2n), value("scvU32", -1), value("scvU32", 1.5), value("scvU32", 0xffff_ffff)]
      .map((sequence) => ({ ...payment, data: value("scvVec", [...originalData.slice(0, 2), sequence]) })),
  ];
  for (const event of malformed) {
    const verdict = await verify({ transaction: { events: [transfer, event] } });
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.match(verdict.reason, /V2 asset-and-sequence/);
  }
});

test("failed transactions, duplicate registry payments and wrong transfers remain rejected", async () => {
  for (const transaction of [
    { status: "FAILED", events: [payment] },
    { events: [transfer, payment, payment] },
    { events: [payment] },
    { events: [payment, { ...transfer, contractId: otherAsset }] },
    { events: [payment, { ...transfer, topics: [transfer.topics[0]!, value("scvAddress", other), transfer.topics[2]!] }] },
    { events: [payment, { ...transfer, data: value("scvI128", 199999n) }] },
    { events: [transfer, { ...payment, topics: [payment.topics[0]!, value("scvAddress", other), payment.topics[2]!] }] },
  ]) {
    assert.equal((await verify({ transaction })).ok, false);
  }
});

test("network, freshness, exact amount and current mandate sequence/accounting checks fail closed", async () => {
  for (const change of [
    { passphrase: "wrong network" },
    { transaction: { latestLedger: 1121 } },
    { requirement: { asset: otherAsset } },
    { requirement: { registryId: otherAsset } },
    { requirement: { merchant: other } },
    { requirement: { amountStroops: 100000n, amount: "0.01" } },
    { requirement: { amountStroops: 300000n, amount: "0.03" } },
    { mandate: { seq: 2 } },
    { mandate: { spent: 199999n } },
    { mandate: { merchant: other } },
    { mandate: { asset: otherAsset } },
  ]) assert.equal((await verify(change)).ok, false);
  assert.throws(() => createMainnetV2PaymentVerifier({ ...config, network: { ...config.network, mandateRegistryId: otherAsset } }), /manifest-pinned/);
});

test("public settled Mainnet metadata verifies native V2 fields only inside the unchanged freshness window", async (t) => {
  const networkGuard = t.mock.method(globalThis, "fetch", async () => { throw new Error("Historical fixture verification is offline and cannot transmit a payment"); });
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/wallet-mainnet-v2-payment.json", import.meta.url), "utf8")) as {
    txHash: string; status: string; ledger: number; latestLedger: number; resultMetaXdr: string;
  };
  assert.equal(fixture.txHash, "b6613ca58ec4723d41957c8bf90bfb44be069d6443f343736f5fda48df1a0467");
  assert.equal(fixture.status, "SUCCESS");
  assert.equal(fixture.ledger, 64286275);
  const events = interpretEvents(extractContractEvents(xdr.TransactionMeta.fromXDR(fixture.resultMetaXdr, "base64")));
  const historicalRelay = "GBALWVF5IYJUW6NBQE7UIOM2JRZIFMMS7OXFDWSYRHU2GUPS3OUM5ZSZ";
  const historicalUser = "GCHNDR6APAMBLIAYTQRCKDHQRBI3E2V5GE6KIRUBXROLHRS46NF5YDVV";
  const historicalMandate = "e21128d9871ea317f003c86ea746e094ebd7496207e9e88b7429a0096bf94cde";
  const pinned = loadAppConfig({ NODE_ENV: "test", ACKRATE_WALLET_NETWORK: "mainnet", ACKRATE_CHAT_AGENT_PUBLIC_KEY: historicalRelay });
  const check = { merchant: historicalRelay, registryId: pinned.public.mandateRegistryId, priceStroops: 200000n };
  assert.deepEqual(selectPayment(events, check), { ok: false, reason: "V2 payment asset does not match this API" });
  assert.deepEqual(selectPayment(events, { ...check, asset: pinned.public.asset.contractId }), {
    ok: true, mandateId: Buffer.from(historicalMandate, "hex"), amount: 200000n, consumedSequence: 0,
  });
  const adapted = adaptMainnetV2PaymentEvents(events);
  assert.equal(adapted.payments[0]?.mandateId.toString("hex"), historicalMandate);
  assert.equal(adapted.payments[0]?.sequence, 0);
  assert.equal(selectPayment(adapted.events, check).ok, true);

  const replayAt = (latestLedger: number) => createMainnetV2PaymentVerifier(pinned, {
    loadNetworkPassphrase: async () => pinned.network.networkPassphrase,
    loadTransaction: async () => ({ status: fixture.status, ledger: fixture.ledger, latestLedger, events }),
    // Model the state immediately after the event's consumed sequence 0. These
    // public fixture terms are not an alternate production mandate loader.
    loadMandate: async (id) => {
      assert.equal(id.toString("hex"), historicalMandate);
      return { user: historicalUser, agent: historicalRelay, merchant: historicalRelay,
        asset: pinned.public.asset.contractId, seq: 1, spent: 200000n };
    },
  }).verify(fixture.txHash, { ...requirement, merchant: historicalRelay });
  const atSettlement = await replayAt(fixture.ledger);
  assert.equal(atSettlement.ok, true, "historical verification at the settlement ledger must understand the deployed event");
  const expired = await replayAt(fixture.latestLedger);
  assert.equal(expired.ok, false, "the historical fixture must not become redeemable after the freshness window");
  if (!expired.ok) assert.match(expired.reason, /outside the accepted proof freshness window/);
  assert.equal(networkGuard.mock.callCount(), 0);
});
