import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Account, Keypair, Networks, Operation, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk";
import { allowanceConflictsWithRegistration } from "../lib/wallet/allowance-sequence";

// Freighter's browser package exposes CommonJS exports in the Node test runtime.
const { AllowanceSubmissionRejected, submitAllowance } = createRequire(import.meta.url)("../lib/wallet/mandate-client.ts") as typeof import("../lib/wallet/mandate-client");

function transaction(sequence = "100") {
  return new TransactionBuilder(new Account(Keypair.random().publicKey(), sequence), { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.manageData({ name: "local-sequence-fixture", value: "no-broadcast" })).setTimeout(600).build();
}

test("submission accepts the exact pending or duplicate hash only", async () => {
  const tx = transaction();
  for (const status of ["PENDING", "DUPLICATE"]) {
    let calls = 0;
    const server = { sendTransaction: async (sent: typeof tx) => { calls++; assert.equal(sent, tx); return { status, hash: tx.hash().toString("hex") }; } } as unknown as rpc.Server;
    assert.equal(await submitAllowance(server, tx), tx.hash().toString("hex"));
    assert.equal(calls, 1);
  }
  const mismatch = { sendTransaction: async () => ({ status: "PENDING", hash: "f".repeat(64) }) } as unknown as rpc.Server;
  await assert.rejects(submitAllowance(mismatch, tx), /different allowance transaction hash/);
});

test("txBadSeq is a typed rejection, not a successful or pending submission", async () => {
  let calls = 0;
  const server = { sendTransaction: async () => {
    calls++;
    return { status: "ERROR", errorResult: { result: () => xdr.TransactionResultResult.txBadSeq() } };
  } } as unknown as rpc.Server;
  await assert.rejects(submitAllowance(server, transaction()), (cause: unknown) => {
    assert.ok(cause instanceof AllowanceSubmissionRejected);
    assert.equal(cause.resultCode, "txBadSeq");
    return true;
  });
  assert.equal(calls, 1, "a rejected body is not blindly rebroadcast");
});

test("a lost submission response remains ambiguous, never a definitive rejection", async () => {
  const server = { sendTransaction: async () => { throw new TypeError("fetch failed"); } } as unknown as rpc.Server;
  await assert.rejects(submitAllowance(server, transaction()), (cause: unknown) => {
    assert.ok(cause instanceof TypeError);
    assert.ok(!(cause instanceof AllowanceSubmissionRejected));
    return true;
  });
});

test("only the exact conflicting registration sequence retires a missing pending allowance", () => {
  const tx = transaction("100");
  assert.equal(allowanceConflictsWithRegistration(tx.toXDR(), Networks.TESTNET, "101"), true);
  assert.equal(allowanceConflictsWithRegistration(tx.toXDR(), Networks.TESTNET, "102"), false, "an older receipt may have landed before registration");
  assert.equal(allowanceConflictsWithRegistration(tx.toXDR(), Networks.TESTNET, "100"), false, "a future sequence can still land");
});

test("sequence preflight stays after the wallet prompt and before retention or broadcast", () => {
  const source = readFileSync(new URL("../lib/wallet/mandate-client.ts", import.meta.url), "utf8");
  const submit = source.slice(source.indexOf("export async function submitPreparedAllowanceWithFreighter"), source.indexOf("export async function approveWithFreighter"));
  assert.equal(submit.indexOf("await "), submit.indexOf("await signer.signTransaction"));
  assert.ok(submit.indexOf("await server.getAccount") > submit.indexOf("await signer.signTransaction"));
  assert.ok(submit.indexOf("BigInt(signedTransaction.sequence)") < submit.indexOf("onPrepared?.(pending)"));
  assert.ok(submit.indexOf("onPrepared?.(pending)") < submit.indexOf("await submitAllowance"));
  const app = readFileSync(new URL("../components/wallet/WalletChatApp.tsx", import.meta.url), "utf8");
  assert.match(app, /prepareAllowanceTransaction\(config, storedToIntent\(stored\), stored.registrationTx\)/);
  assert.match(app, /prepareAllowanceTransaction\(config, intent, stored.registrationTx\)/);
  assert.match(app, /waitForConfirmation: false, registrationTx: stored.registrationTx/);
  assert.match(app, /cause instanceof AllowanceSubmissionRejected/);
  assert.match(app, /Allowance submission rejected/);
  assert.match(app, /allowanceConflictsWithRegistration/);
});
