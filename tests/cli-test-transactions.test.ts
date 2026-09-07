import assert from "node:assert/strict";
import test from "node:test";
import { Account, Asset, Keypair, Networks, Operation, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import {
  buildCliFunding, verifyCliFundingSigned, CLI_MAINNET_PASSPHRASE,
  CLI_USDC_ISSUER, CLI_MAX_XDR_LENGTH,
} from "../lib/cli-test-transactions";

const now = 1_800_000_000;
function fixture() {
  const owner = Keypair.random();
  const actors = { payer: Keypair.random(), agent: Keypair.random(), merchant: Keypair.random() };
  const account = new Account(owner.publicKey(), "99");
  const prepared = buildCliFunding(account, actors, now);
  const signed = TransactionBuilder.fromXDR(prepared.toXDR(), CLI_MAINNET_PASSPHRASE) as Transaction;
  signed.sign(owner);
  return { owner, actors, account, prepared, signed };
}

test("funding builds exactly six capped Mainnet operations with only the two local signatures", () => {
  const { owner, actors, account, prepared, signed } = fixture();
  assert.equal(account.sequenceNumber(), "99", "preparation must not mutate the caller's account");
  assert.equal(prepared.source, owner.publicKey());
  assert.equal(prepared.sequence, "100");
  assert.equal(prepared.fee, "600");
  assert.deepEqual(prepared.timeBounds, { minTime: String(now), maxTime: String(now + 600) });
  assert.deepEqual(prepared.operations, [
    { type: "createAccount", destination: actors.payer.publicKey(), startingBalance: "2.1000000" },
    { type: "createAccount", destination: actors.agent.publicKey(), startingBalance: "2.1000000" },
    { type: "createAccount", destination: actors.merchant.publicKey(), startingBalance: "1.8000000" },
    { type: "changeTrust", source: actors.payer.publicKey(), line: new Asset("USDC", CLI_USDC_ISSUER), limit: "0.0300000" },
    { type: "changeTrust", source: actors.merchant.publicKey(), line: new Asset("USDC", CLI_USDC_ISSUER), limit: "0.0300000" },
    { type: "payment", destination: actors.payer.publicKey(), asset: new Asset("USDC", CLI_USDC_ISSUER), amount: "0.0300000" },
  ]);
  assert.equal(prepared.signatures.length, 2);
  for (const key of [actors.payer, actors.merchant]) {
    assert.ok(prepared.signatures.some((signature) => key.verify(prepared.hash(), signature.signature())));
  }
  assert.equal(verifyCliFundingSigned(prepared.toXDR(), signed.toXDR(), owner.publicKey(), now).toXDR(), signed.toXDR());
});

test("funding rejects changed amounts, destinations, source, fee, sequence, and extra operations", () => {
  const { owner, actors, prepared } = fixture();
  const changes = [
    (builder: TransactionBuilder) => builder.clearOperationAt(5).addOperation(Operation.payment({ destination: actors.payer.publicKey(), asset: new Asset("USDC", CLI_USDC_ISSUER), amount: "0.04" })),
    (builder: TransactionBuilder) => builder.clearOperationAt(5).addOperation(Operation.payment({ destination: actors.agent.publicKey(), asset: new Asset("USDC", CLI_USDC_ISSUER), amount: "0.03" })),
    (builder: TransactionBuilder) => builder.addOperation(Operation.manageData({ name: "extra", value: "no" })),
  ];
  for (const change of changes) {
    const changed = change(TransactionBuilder.cloneFrom(prepared)).build();
    changed.sign(owner, actors.payer, actors.merchant);
    assert.throws(() => verifyCliFundingSigned(prepared.toXDR(), changed.toXDR(), owner.publicKey(), now), /does not match/);
  }
  const feeChanged = TransactionBuilder.cloneFrom(prepared, { fee: "101" }).build();
  feeChanged.sign(owner, actors.payer, actors.merchant);
  assert.throws(() => verifyCliFundingSigned(prepared.toXDR(), feeChanged.toXDR(), owner.publicKey(), now), /does not match/);
  const sequenceChanged = buildCliFunding(new Account(owner.publicKey(), "100"), actors, now);
  sequenceChanged.sign(owner);
  assert.throws(() => verifyCliFundingSigned(prepared.toXDR(), sequenceChanged.toXDR(), owner.publicKey(), now), /does not match/);
  assert.throws(() => verifyCliFundingSigned(prepared.toXDR(), prepared.toXDR(), actors.agent.publicKey(), now), /does not match/);
});

test("funding requires exactly one valid Mainnet signature from each required account", () => {
  const { owner, actors, prepared, signed } = fixture();
  assert.throws(() => verifyCliFundingSigned(prepared.toXDR(), prepared.toXDR(), owner.publicKey(), now), /signatures/);
  const onlyOwner = TransactionBuilder.fromXDR(prepared.toXDR(), CLI_MAINNET_PASSPHRASE) as Transaction;
  onlyOwner.signatures.splice(0);
  onlyOwner.sign(owner);
  assert.throws(() => verifyCliFundingSigned(prepared.toXDR(), onlyOwner.toXDR(), owner.publicKey(), now), /signatures/);
  const wrongOwner = TransactionBuilder.fromXDR(prepared.toXDR(), Networks.TESTNET) as Transaction;
  wrongOwner.sign(owner);
  assert.throws(() => verifyCliFundingSigned(prepared.toXDR(), wrongOwner.toXDR(), owner.publicKey(), now), /signature could not/);
  signed.sign(actors.agent);
  assert.throws(() => verifyCliFundingSigned(prepared.toXDR(), signed.toXDR(), owner.publicKey(), now), /signatures/);
  signed.signatures.splice(2);
  signed.sign(actors.payer);
  assert.throws(() => verifyCliFundingSigned(prepared.toXDR(), signed.toXDR(), owner.publicKey(), now), /signature could not/);
});

test("funding fails closed on malformed or oversized input, expired bounds, fee-bumps, and actor reuse", () => {
  const { owner, actors, prepared, signed } = fixture();
  for (const value of ["", "bad", "A".repeat(CLI_MAX_XDR_LENGTH + 1), `${signed.toXDR()}\n`]) {
    assert.throws(() => verifyCliFundingSigned(prepared.toXDR(), value, owner.publicKey(), now));
    assert.throws(() => verifyCliFundingSigned(value, signed.toXDR(), owner.publicKey(), now));
  }
  for (const time of [now - 1, now + 600, now + 601, NaN]) {
    assert.throws(() => verifyCliFundingSigned(prepared.toXDR(), signed.toXDR(), owner.publicKey(), time), /bounds|expired|clock/);
  }
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(owner, "100", signed, CLI_MAINNET_PASSPHRASE);
  assert.throws(() => verifyCliFundingSigned(prepared.toXDR(), feeBump.toXDR(), owner.publicKey(), now), /normal Stellar transaction/);
  assert.throws(() => buildCliFunding(new Account(owner.publicKey(), "99"), { ...actors, payer: owner }, now), /distinct/);
  assert.throws(() => buildCliFunding(new Account(owner.publicKey(), "99"), { ...actors, agent: actors.payer }, now), /distinct/);
});
