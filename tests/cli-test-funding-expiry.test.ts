import assert from "node:assert/strict";
import test from "node:test";
import { Account, Keypair, Networks, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { buildCliFunding, CLI_FUNDING_CLOCK_ALLOWANCE_SECONDS, CLI_MAINNET_HORIZON, CLI_MAINNET_PASSPHRASE, CLI_MAINNET_RPC } from "../lib/cli-test-transactions";
import { proveCliFundingExpiredUnused, type CliFundingExpiryContext, type CliFundingExpiryReads } from "../lib/cli-test-funding-expiry";

const NOW = 1_900_000_000;
const SEQUENCE = "4000000000000000000";
function key(address: string) {
  return xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: Keypair.fromPublicKey(address).xdrAccountId() }));
}
function entry(address: string, sequence = SEQUENCE) {
  return { key: key(address), lastModifiedLedgerSeq: 1190, val: xdr.LedgerEntryData.account(new xdr.AccountEntry({
    accountId: Keypair.fromPublicKey(address).xdrAccountId(), balance: xdr.Int64.fromString("200000000"),
    seqNum: xdr.Int64.fromString(sequence), numSubEntries: 1, inflationDest: null,
    flags: 0, homeDomain: "", thresholds: Buffer.from([1, 0, 0, 0]), signers: [], ext: new xdr.AccountEntryExt(0),
  })) };
}
function fixture() {
  const owner = Keypair.random();
  const actors = { payer: Keypair.random(), agent: Keypair.random(), merchant: Keypair.random() };
  const tx = buildCliFunding(new Account(owner.publicKey(), SEQUENCE), actors, NOW - 700 + CLI_FUNDING_CLOCK_ALLOWANCE_SECONDS);
  const row: CliFundingExpiryContext = { owner: owner.publicKey(), payer: actors.payer.publicKey(), agent: actors.agent.publicKey(), merchant: actors.merchant.publicKey(),
    fundingXdr: tx.toXDR(), fundingHash: tx.hash().toString("hex"), fundingExpiresAt: NOW - 100 };
  const calls: string[] = [];
  let horizon: unknown = { _embedded: { records: [{ sequence: 1199, closed_at: new Date((NOW - 20) * 1000).toISOString().replace(".000Z", "Z") }] } };
  let network: unknown = { passphrase: CLI_MAINNET_PASSPHRASE };
  let snapshot: unknown = { latestLedger: 1200, entries: [entry(row.owner)] };
  const reads: CliFundingExpiryReads = {
    async getLatestHorizonLedger() { calls.push("horizon"); return horizon; },
    async getNetwork() { calls.push("network"); return network; },
    async getLedgerEntries(...keys) {
      calls.push("accounts");
      assert.deepEqual(keys.map((value) => value.toXDR("base64")), [row.owner, row.payer, row.agent, row.merchant].map((address) => key(address).toXDR("base64")));
      return snapshot;
    },
  };
  return { row, tx, reads, calls, setHorizon: (value: unknown) => { horizon = value; }, setNetwork: (value: unknown) => { network = value; }, setSnapshot: (value: unknown) => { snapshot = value; } };
}

test("funding expiry proof binds exact original hash/actors and a single post-expiry owner-plus-actors snapshot", async () => {
  const f = fixture(); const proof = await proveCliFundingExpiredUnused(f.row, f.reads, NOW);
  assert.deepEqual(proof, { kind: "expired-unused", originalHash: f.row.fundingHash,
    owner: f.row.owner, payer: f.row.payer, agent: f.row.agent, merchant: f.row.merchant,
    originalSequence: "4000000000000000001", currentOwnerSequence: SEQUENCE, maxTime: NOW - 100,
    horizonLedger: 1199, horizonClosedAt: NOW - 20, rpcLedger: 1200, observedAt: NOW });
  assert.deepEqual(f.calls, ["horizon", "network", "accounts"]);
  assert.equal(Object.isFrozen(proof), true);
});

test("altered original hash, source, actor, network hash, expiry, and malformed XDR reject before network reads", async () => {
  const f = fixture();
  const testnetHash = TransactionBuilder.fromXDR(f.row.fundingXdr, Networks.TESTNET).hash().toString("hex");
  const alterations = [
    { fundingHash: "b".repeat(64) }, { owner: Keypair.random().publicKey() }, { payer: Keypair.random().publicKey() },
    { fundingHash: testnetHash }, { fundingExpiresAt: NOW }, { fundingXdr: "not-xdr" }, { fundingXdr: "a".repeat(131073) },
  ];
  for (const patch of alterations) await assert.rejects(proveCliFundingExpiredUnused({ ...f.row, ...patch }, f.reads, NOW), /Original funding/);
  assert.deepEqual(f.calls, []);
});

test("even a matching hash does not allow altered budget/fee or replacement actor bindings", async () => {
  const f = fixture();
  const changed = TransactionBuilder.cloneFrom(f.tx, { fee: "101" }).build();
  await assert.rejects(proveCliFundingExpiredUnused({ ...f.row, fundingXdr: changed.toXDR(), fundingHash: changed.hash().toString("hex") }, f.reads, NOW), /operations, or budget/);
  const g = fixture();
  await assert.rejects(proveCliFundingExpiredUnused({ ...f.row, fundingXdr: g.row.fundingXdr, fundingHash: g.row.fundingHash }, f.reads, NOW), /identity/);
  assert.deepEqual(f.calls, []);
});

test("expiry needs a strictly later ledger close, not local clock or an equal close time", async () => {
  for (const seconds of [NOW - 101, NOW - 100]) {
    const f = fixture(); f.setHorizon({ _embedded: { records: [{ sequence: 1199, closed_at: new Date(seconds * 1000).toISOString().replace(".000Z", "Z") }] } });
    await assert.rejects(proveCliFundingExpiredUnused(f.row, f.reads, NOW), /not proven expired/);
    assert.equal(f.calls.includes("accounts"), false);
  }
});

test("stale, future, missing, malformed and unsafe ledger/clock values fail closed", async () => {
  const malformed: unknown[] = [null, {}, { _embedded: { records: [] } }, { _embedded: { records: [{}] } }];
  for (const sequence of [undefined, 0, -1, NaN, Infinity, 1.5, "1199", 0x1_0000_0000]) {
    malformed.push({ _embedded: { records: [{ sequence, closed_at: new Date((NOW - 20) * 1000).toISOString().replace(".000Z", "Z") }] } });
  }
  for (const closed_at of ["invalid", "2026-02-30T00:00:00Z", new Date((NOW - 121) * 1000).toISOString().replace(".000Z", "Z"), new Date((NOW + 1) * 1000).toISOString().replace(".000Z", "Z")]) {
    malformed.push({ _embedded: { records: [{ sequence: 1199, closed_at }] } });
  }
  for (const value of malformed) {
    const f = fixture(); f.setHorizon(value);
    await assert.rejects(proveCliFundingExpiredUnused(f.row, f.reads, NOW));
    assert.equal(f.calls.includes("accounts"), false);
  }
  const f = fixture();
  for (const clock of [0, -1, NaN, Infinity, 1.1, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(proveCliFundingExpiredUnused(f.row, f.reads, clock), /clock is invalid/);
  }
  assert.deepEqual(f.calls, []);
});

test("wrong or malformed network identity never reaches the account snapshot", async () => {
  for (const value of [null, {}, { passphrase: Networks.TESTNET }, { passphrase: CLI_MAINNET_PASSPHRASE, error: {} }]) {
    const f = fixture(); f.setNetwork(value);
    await assert.rejects(proveCliFundingExpiredUnused(f.row, f.reads, NOW));
    assert.equal(f.calls.includes("accounts"), false);
  }
});

test("account snapshot must be at or after the after-expiry ledger with valid safe integer metadata", async () => {
  for (const latestLedger of [undefined, 0, -1, NaN, Infinity, 1198, 1199.5, "1200", 0x1_0000_0000]) {
    const f = fixture(); f.setSnapshot({ latestLedger, entries: [entry(f.row.owner)] });
    await assert.rejects(proveCliFundingExpiredUnused(f.row, f.reads, NOW), /snapshot predates/);
  }
  const f = fixture(); f.setSnapshot({ latestLedger: 1199, entries: [entry(f.row.owner)] });
  assert.equal((await proveCliFundingExpiredUnused(f.row, f.reads, NOW)).rpcLedger, 1199);
  for (const lastModifiedLedgerSeq of [undefined, 0, -1, NaN, Infinity, 1201, 1199.5]) {
    f.setSnapshot({ latestLedger: 1200, entries: [{ ...entry(f.row.owner), lastModifiedLedgerSeq }] });
    await assert.rejects(proveCliFundingExpiredUnused(f.row, f.reads, NOW), /owner account evidence/);
  }
});

test("missing owner data and any present actor deny unused funding proof", async () => {
  for (const ownerAbsent of [undefined, [], [{}]]) {
    const f = fixture(); f.setSnapshot({ latestLedger: 1200, entries: ownerAbsent });
    await assert.rejects(proveCliFundingExpiredUnused(f.row, f.reads, NOW));
  }
  for (const role of ["payer", "agent", "merchant"] as const) {
    const f = fixture(); f.setSnapshot({ latestLedger: 1200, entries: [entry(f.row.owner), entry(f.row[role])] });
    await assert.rejects(proveCliFundingExpiredUnused(f.row, f.reads, NOW), /owner present and all three actors absent/);
  }
});

test("advanced, regressed, or wrong-owner account evidence denies proof even when all actors are absent", async () => {
  for (const sequence of ["4000000000000000001", "3999999999999999999", "-1"]) {
    const f = fixture(); f.setSnapshot({ latestLedger: 1200, entries: [entry(f.row.owner, sequence)] });
    await assert.rejects(proveCliFundingExpiredUnused(f.row, f.reads, NOW), /owner sequence changed/);
  }
  const f = fixture(); const wrong = entry(f.row.payer);
  f.setSnapshot({ latestLedger: 1200, entries: [{ ...wrong, key: key(f.row.owner) }] });
  await assert.rejects(proveCliFundingExpiredUnused(f.row, f.reads, NOW), /owner sequence changed/);
  f.setSnapshot({ latestLedger: 1200, entries: [{ ...entry(f.row.owner), key: key(f.row.payer) }] });
  await assert.rejects(proveCliFundingExpiredUnused(f.row, f.reads, NOW), /owner account evidence/);
});

test("read failures return static errors and do not fall back to weaker separate-account reads", async () => {
  for (const method of ["getNetwork", "getLatestHorizonLedger", "getLedgerEntries"] as const) {
    const f = fixture(); f.reads[method] = async () => { throw new Error("synthetic provider body must not escape"); };
    await assert.rejects(proveCliFundingExpiredUnused(f.row, f.reads, NOW), (error: unknown) => {
      assert.ok(error instanceof Error); assert.equal(error.message.includes("synthetic provider"), false); return true;
    });
  }
});

test("default transport uses only pinned read endpoints and actual SDK four-account XDR request", async (context) => {
  const f = fixture(); const methods: string[] = [];
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, options?: RequestInit) => {
    const url = String(input);
    assert.ok(options?.signal);
    if (url === `${CLI_MAINNET_HORIZON}/ledgers?order=desc&limit=1`) {
      assert.equal(options?.redirect, "error");
      methods.push("horizon"); return Response.json(await f.reads.getLatestHorizonLedger());
    }
    // The SDK uses manual redirects with maxRedirects=0 and rejects 3xx itself.
    assert.ok(options?.redirect === "manual" || options?.redirect === "error");
    assert.equal(url, `${CLI_MAINNET_RPC}/`);
    const request = JSON.parse(String(options?.body));
    methods.push(request.method);
    assert.equal(options?.method?.toUpperCase(), "POST");
    if (request.method === "getNetwork") return Response.json({ jsonrpc: "2.0", id: 1, result: { passphrase: CLI_MAINNET_PASSPHRASE } });
    assert.equal(request.method, "getLedgerEntries");
    assert.deepEqual(request.params.keys, [f.row.owner, f.row.payer, f.row.agent, f.row.merchant].map((address) => key(address).toXDR("base64")));
    const owner = entry(f.row.owner);
    return Response.json({ jsonrpc: "2.0", id: 1, result: { latestLedger: 1200, entries: [{ key: owner.key.toXDR("base64"), xdr: owner.val.toXDR("base64"), lastModifiedLedgerSeq: 1190 }] } });
  });
  assert.equal((await proveCliFundingExpiredUnused(f.row, undefined, NOW)).kind, "expired-unused");
  assert.deepEqual(methods.sort(), ["getLedgerEntries", "getNetwork", "horizon"].sort());
});
