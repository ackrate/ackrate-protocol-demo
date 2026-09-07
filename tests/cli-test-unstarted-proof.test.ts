import assert from "node:assert/strict";
import test from "node:test";
import { Account, Address, Contract, Keypair, TransactionBuilder, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { buildCliFunding, CLI_MAINNET_PASSPHRASE, CLI_MAINNET_REGISTRY, CLI_USDC_SAC } from "../lib/cli-test-transactions";
import { proveCliRegisteredSetup, proveCliTestUnstarted, type CliUnstartedContext, type CliUnstartedReads } from "../lib/cli-test-unstarted-proof";

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
  return { row, values, reads, owner, actors, snapshots: () => snapshots };
}

function registeredFixture() {
  const f = fixture(); const registeredAt = NOW - 800;
  const row = { ...f.row, registrationHash: "" };
  const registration: Record<string, unknown> = {};
  function replace(options: { args?: xdr.ScVal[]; contract?: string; method?: string; sequence?: string;
    signers?: Keypair[]; duplicateOperation?: boolean } = {}) {
    const args = options.args ?? [row.payer, row.agent, row.merchant, CLI_USDC_SAC].map(value => new Address(value).toScVal()).concat([
      nativeToScVal(300_000n, { type: "i128" }), nativeToScVal(BigInt(NOW + 2000), { type: "u64" }), xdr.ScVal.scvBytes(Buffer.alloc(32, 7)),
    ]);
    const operation = new Contract(options.contract ?? CLI_MAINNET_REGISTRY).call(options.method ?? "register_mandate", ...args);
    const builder = new TransactionBuilder(new Account(row.payer, options.sequence ?? (1000n << 32n).toString()), {
      fee: "3035068", networkPassphrase: CLI_MAINNET_PASSPHRASE,
      timebounds: { minTime: registeredAt - 30, maxTime: registeredAt + 60 },
    }).addOperation(operation);
    if (options.duplicateOperation) builder.addOperation(operation);
    const tx = builder.build(); for (const signer of options.signers ?? [f.actors.payer]) tx.sign(signer);
    row.registrationHash = tx.hash().toString("hex");
    Object.assign(registration, { hash: row.registrationHash, source_account: row.payer, successful: true,
      ledger: 1050, created_at: iso(registeredAt), envelope_xdr: tx.toXDR() });
    return args;
  }
  const args = replace();
  f.values.snapshot.entries[0] = account(row.payer, ((1000n << 32n) + 1n).toString());
  f.values.snapshot.entries[0].lastModifiedLedgerSeq = 1050;
  const reads = { ...f.reads, async getFundingTransaction(hash: string) {
    if (hash === row.registrationHash) return registration;
    return f.reads.getFundingTransaction(hash);
  } };
  return { ...f, row, reads, registration, replace, args };
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

test("registered-only proof binds the one payer transaction without weakening unstarted proof", async () => {
  const f = registeredFixture(); const proof = await proveCliRegisteredSetup(f.row, f.reads, NOW);
  assert.equal(proof.kind, "registered-unspent"); assert.equal(proof.registrationHash, f.row.registrationHash);
  assert.equal(proof.registrationLedger, 1050); assert.equal(proof.mandateExpiry, NOW + 2000);
  assert.equal(proof.initialActorSequence, (1000n << 32n).toString());
  assert.equal(proof.fundingHash, f.row.fundingHash); assert.equal(f.snapshots(), 1); assert.ok(Object.isFrozen(proof));
  await assert.rejects(proveCliTestUnstarted(f.row, f.reads, NOW), /sequence changed/);
});

test("registered-only proof rejects wrong, failed, malformed, or late registration evidence", async () => {
  for (const patch of [{ hash: "a".repeat(64) }, { source_account: Keypair.random().publicKey() }, { successful: false },
    { ledger: 999 }, { ledger: 1101 }, { created_at: iso(NOW - 699) }, { created_at: iso(NOW - 1000) }, { envelope_xdr: "bad" }]) {
    const f = registeredFixture(); Object.assign(f.registration, patch);
    await assert.rejects(proveCliRegisteredSetup(f.row, f.reads, NOW)); assert.equal(f.snapshots(), 0);
  }
  const f = registeredFixture(); f.row.registrationHash = f.row.fundingHash;
  await assert.rejects(proveCliRegisteredSetup(f.row, f.reads, NOW), /identity/);
});

test("registered-only proof checks authentic signed operation scope, amount, expiry, and credential", async () => {
  for (let index = 0; index < 7; index++) {
    const f = registeredFixture(); const args = [...f.args];
    args[index] = index < 4 ? new Address(Keypair.random().publicKey()).toScVal()
      : index === 4 ? nativeToScVal(300_001n, { type: "i128" })
      : index === 5 ? nativeToScVal(BigInt(NOW), { type: "u64" }) : xdr.ScVal.scvBytes(Buffer.alloc(31));
    f.replace({ args }); await assert.rejects(proveCliRegisteredSetup(f.row, f.reads, NOW), /scope, or expiry/);
  }
  for (const modify of [
    (f: ReturnType<typeof registeredFixture>) => f.replace({ contract: CLI_USDC_SAC }),
    (f: ReturnType<typeof registeredFixture>) => f.replace({ method: "execute" }),
    (f: ReturnType<typeof registeredFixture>) => f.replace({ args: [...f.args, xdr.ScVal.scvVoid()] }),
    (f: ReturnType<typeof registeredFixture>) => f.replace({ args: f.args.map((arg, index) => index === 5 ? nativeToScVal(BigInt(NOW + 3000), { type: "u64" }) : arg) }),
    (f: ReturnType<typeof registeredFixture>) => f.replace({ sequence: ((1000n << 32n) + 1n).toString() }),
    (f: ReturnType<typeof registeredFixture>) => f.replace({ signers: [] }),
    (f: ReturnType<typeof registeredFixture>) => f.replace({ signers: [f.actors.agent] }),
    (f: ReturnType<typeof registeredFixture>) => f.replace({ signers: [f.actors.payer, f.actors.agent] }),
    (f: ReturnType<typeof registeredFixture>) => f.replace({ duplicateOperation: true }),
  ]) {
    const f = registeredFixture(); modify(f); await assert.rejects(proveCliRegisteredSetup(f.row, f.reads, NOW));
  }
});

test("registered-only proof requires exact payer plus-one and unchanged other actors in one fresh snapshot", async () => {
  for (const [index, increment] of [[0, 0n], [0, 2n], [1, 1n], [2, 1n]] as const) {
    const f = registeredFixture(); const address = [f.row.payer, f.row.agent, f.row.merchant][index];
    f.values.snapshot.entries[index] = account(address, ((1000n << 32n) + increment).toString());
    f.values.snapshot.entries[index].lastModifiedLedgerSeq = 1050;
    await assert.rejects(proveCliRegisteredSetup(f.row, f.reads, NOW), /sequence changed/);
  }
  for (const change of [
    (f: ReturnType<typeof registeredFixture>) => { f.values.snapshot.entries[0].lastModifiedLedgerSeq = 1049; },
    (f: ReturnType<typeof registeredFixture>) => { f.values.ledger.closed_at = iso(f.row.finishedAt + 600); },
    (f: ReturnType<typeof registeredFixture>) => { f.values.snapshot.latestLedger = 1099; },
    (f: ReturnType<typeof registeredFixture>) => { f.values.network.passphrase = "wrong"; },
    (f: ReturnType<typeof registeredFixture>) => { f.values.funding.successful = false; },
  ]) {
    const f = registeredFixture(); change(f); await assert.rejects(proveCliRegisteredSetup(f.row, f.reads, NOW));
  }
});
