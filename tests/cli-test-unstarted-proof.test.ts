import assert from "node:assert/strict";
import test from "node:test";
import { Account, Keypair, xdr } from "@stellar/stellar-sdk";
import { buildCliFunding, CLI_MAINNET_PASSPHRASE } from "../lib/cli-test-transactions";
import { proveCliTestUnstarted, type CliUnstartedContext, type CliUnstartedReads } from "../lib/cli-test-unstarted-proof";

const NOW = 1_900_000_000;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString().replace(".000Z", "Z");
function account(address: string, sequence = (1000n << 32n).toString()) {
  const id = Keypair.fromPublicKey(address).xdrAccountId();
  return { key: xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: id })), lastModifiedLedgerSeq: 1000,
    val: xdr.LedgerEntryData.account(new xdr.AccountEntry({ accountId: id, balance: xdr.Int64.fromString("21000000"),
      seqNum: xdr.Int64.fromString(sequence), numSubEntries: 1, inflationDest: null, flags: 0,
      homeDomain: "", thresholds: Buffer.from([1, 0, 0, 0]), signers: [], ext: new xdr.AccountEntryExt(0) })) };
}
function fixture() {
  const owner = Keypair.random();
  const actors = { payer: Keypair.random(), agent: Keypair.random(), merchant: Keypair.random() };
  const tx = buildCliFunding(new Account(owner.publicKey(), "1234"), actors, NOW - 1000); tx.sign(owner);
  const row: CliUnstartedContext = { id: "9f54b4f8-554b-4e92-acfd-4dd25631cbcc", state: "failed", finishedAt: NOW - 700,
    fundingHash: tx.hash().toString("hex"), owner: owner.publicKey(), payer: actors.payer.publicKey(),
    agent: actors.agent.publicKey(), merchant: actors.merchant.publicKey() };
  const values = {
    funding: { hash: row.fundingHash, source_account: row.owner, successful: true, ledger: 1000,
      created_at: iso(NOW - 995), envelope_xdr: tx.toXDR() } as Record<string, unknown>,
    network: { passphrase: CLI_MAINNET_PASSPHRASE } as Record<string, unknown>,
    ledger: { sequence: 1100, closed_at: iso(NOW - 5) } as Record<string, unknown>,
    snapshot: { latestLedger: 1101, entries: [row.payer, row.agent, row.merchant].map(key => account(key)) },
  };
  let snapshots = 0;
  const reads: CliUnstartedReads = {
    async getFundingTransaction(hash) { assert.equal(hash, row.fundingHash); return values.funding; },
    async getNetwork() { return values.network; },
    async getLatestHorizonLedger() { return { _embedded: { records: [values.ledger] } }; },
    async getLedgerEntries(...keys) { snapshots++;
      assert.deepEqual(keys.map(key => key.toXDR("base64")), [row.payer, row.agent, row.merchant].map(address => account(address).key.toXDR("base64")));
      return values.snapshot;
    },
  };
  return { row, values, reads, snapshots: () => snapshots };
}

test("exact funded and unstarted actors produce one bound immutable proof", async () => {
  const f = fixture(); const proof = await proveCliTestUnstarted(f.row, f.reads, NOW);
  assert.equal(proof.kind, "funded-unstarted"); assert.equal(proof.runId, f.row.id);
  assert.equal(proof.fundingHash, f.row.fundingHash); assert.equal(proof.initialActorSequence, (1000n << 32n).toString());
  assert.equal(proof.rpcLedger, 1101); assert.equal(proof.finishedAt, NOW - 700);
  assert.equal(f.snapshots(), 1); assert.equal(Object.isFrozen(proof), true);
});
test("mismatched, unsuccessful, malformed or altered funding fails before account reads", async () => {
  for (const patch of [{ hash: "a".repeat(64) }, { source_account: Keypair.random().publicKey() }, { successful: false },
    { ledger: 0 }, { ledger: 1.5 }, { created_at: "2030-02-30T00:00:00Z" }, { created_at: iso(NOW) }, { envelope_xdr: "bad" }]) {
    const f = fixture(); Object.assign(f.values.funding, patch);
    await assert.rejects(proveCliTestUnstarted(f.row, f.reads, NOW)); assert.equal(f.snapshots(), 0);
  }
  const f = fixture(); f.row.payer = Keypair.random().publicKey();
  await assert.rejects(proveCliTestUnstarted(f.row, f.reads, NOW), /actors/);
});
test("stale, future, unexpired, malformed and wrong-network evidence is rejected", async () => {
  for (const closed_at of [iso(NOW - 121), iso(NOW + 1), iso(NOW - 100), "2030-02-30T00:00:00Z"]) {
    const f = fixture(); f.values.ledger.closed_at = closed_at;
    await assert.rejects(proveCliTestUnstarted(f.row, f.reads, NOW)); assert.equal(f.snapshots(), 0);
  }
  for (const network of [{ passphrase: "wrong" }, { passphrase: CLI_MAINNET_PASSPHRASE, error: "bad" }]) {
    const f = fixture(); f.values.network = network;
    await assert.rejects(proveCliTestUnstarted(f.row, f.reads, NOW), /network/);
  }
  for (const clock of [NaN, 0, NOW - 100, Number.MAX_SAFE_INTEGER + 1]) {
    const f = fixture(); await assert.rejects(proveCliTestUnstarted(f.row, f.reads, clock));
  }
});
test("all actors must have their creation sequence in one current complete snapshot", async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.values.snapshot.entries.pop(); },
    (f: ReturnType<typeof fixture>) => { f.values.snapshot.entries[1] = f.values.snapshot.entries[0]; },
    (f: ReturnType<typeof fixture>) => { f.values.snapshot.entries[0] = account(f.row.payer, ((1000n << 32n) + 1n).toString()); },
    (f: ReturnType<typeof fixture>) => { f.values.snapshot.entries[0] = account(f.row.payer, ((1000n << 32n) - 1n).toString()); },
    (f: ReturnType<typeof fixture>) => { f.values.snapshot.entries[0] = account(Keypair.random().publicKey()); },
    (f: ReturnType<typeof fixture>) => { f.values.snapshot.latestLedger = 1099; },
    (f: ReturnType<typeof fixture>) => { f.values.snapshot.entries[0].lastModifiedLedgerSeq = 1102; },
  ]) {
    const f = fixture(); change(f); await assert.rejects(proveCliTestUnstarted(f.row, f.reads, NOW));
  }
});
test("provider failures have no fallback and do not disclose provider error details", async () => {
  for (const method of ["getFundingTransaction", "getLatestHorizonLedger", "getNetwork", "getLedgerEntries"] as const) {
    const f = fixture(); f.reads[method] = async () => { throw new Error("sensitive-provider-detail"); };
    await assert.rejects(proveCliTestUnstarted(f.row, f.reads, NOW), error =>
      error instanceof Error && /unavailable/.test(error.message) && !error.message.includes("sensitive-provider-detail"));
  }
});
