import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { type TestContext } from "node:test";
import type { IntentMandate } from "@ackrate/core";
import { Account, Address, Contract, Keypair, Networks, Operation, StrKey, TransactionBuilder, nativeToScVal, type Transaction, type xdr } from "@stellar/stellar-sdk";
import { confirmedRegistrationSequence, selectAllowanceAccountSequence, validateAllowanceSequence } from "../lib/wallet/allowance-sequence";

function fixture(networkPassphrase = Networks.TESTNET) {
  const user = Keypair.random().publicKey();
  const config = { rpcUrl: "/api/wallet/rpc", networkPassphrase, mandateRegistryId: StrKey.encodeContract(Buffer.alloc(32, 1)) };
  const mandate = {
    user, agent: Keypair.random().publicKey(), merchant: Keypair.random().publicKey(),
    asset: StrKey.encodeContract(Buffer.alloc(32, 2)), maxAmount: 1000000n, expiry: 2000,
    id: Buffer.alloc(32, 9).toString("hex"), idBuffer: Buffer.alloc(32, 9), decimals: 7,
    credentialHash: Buffer.alloc(32, 4).toString("hex"),
  } satisfies IntentMandate & { credentialHash: string };
  const args = [
    ...[mandate.user, mandate.agent, mandate.merchant, mandate.asset].map((value) => new Address(value).toScVal()),
    nativeToScVal(mandate.maxAmount, { type: "i128" }), nativeToScVal(BigInt(mandate.expiry), { type: "u64" }),
    nativeToScVal(Buffer.from(mandate.credentialHash, "hex"), { type: "bytes" }),
  ];
  const transaction = (options: { source?: string; contract?: string; functionName?: string; values?: xdr.ScVal[]; operation?: xdr.Operation } = {}) => {
    return new TransactionBuilder(new Account(options.source ?? user, "100"), {
      fee: "100", networkPassphrase, timebounds: { minTime: 0, maxTime: 1800 },
    }).addOperation(options.operation ?? new Contract(options.contract ?? config.mandateRegistryId).call(options.functionName ?? "register_mandate", ...(options.values ?? args))).build();
  };
  const receipt = transaction();
  return { config, mandate, args, transaction, receipt, hash: receipt.hash().toString("hex") };
}

function mockReceipt(t: TestContext, hash: string, result: unknown) {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    calls++;
    assert.equal(url, "/api/wallet/rpc");
    assert.equal(init?.method, "POST");
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(String(init?.body)), {
      jsonrpc: "2.0", id: "allowance-registration-sequence", method: "getTransaction", params: { hash },
    });
    return Response.json(result);
  });
  return () => calls;
}

test("the actual confirmed registration supplies the sequence floor despite a stale account index", async (t) => {
  const { config, mandate, receipt, hash } = fixture();
  const calls = mockReceipt(t, hash, { result: { status: "SUCCESS", envelopeXdr: receipt.toXDR() } });
  const confirmed = await confirmedRegistrationSequence(config, mandate, hash);
  assert.equal(confirmed, "101");
  assert.equal(selectAllowanceAccountSequence("100", confirmed), "101");
  assert.equal(selectAllowanceAccountSequence("103", confirmed), "103");
  assert.equal(calls(), 1);
});

test("actual allowance preparation builds sequence 102 after registration 101 despite Horizon reporting 100", async (t) => {
  // The client package has browser-oriented ESM exports; the installed CommonJS
  // entry is used only to execute this local preparation test without a wallet.
  const require = createRequire(import.meta.url);
  const client = require("../lib/wallet/mandate-client.ts") as typeof import("../lib/wallet/mandate-client");
  const sdk = require("@stellar/stellar-sdk") as typeof import("@stellar/stellar-sdk");
  const { config, mandate, receipt, hash } = fixture(Networks.PUBLIC);
  const requestedMethods: string[] = [];
  let broadcasts = 0;
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === `https://horizon.stellar.org/accounts/${mandate.user}`) {
      assert.equal(init?.cache, "no-store");
      requestedMethods.push("account-sequence");
      return Response.json({ account_id: mandate.user, sequence: "100" });
    }
    assert.equal(String(url), "https://fixture.invalid/rpc");
    const body = JSON.parse(String(init?.body));
    requestedMethods.push(body.method);
    if (body.method === "getTransaction") {
      assert.deepEqual(body.params, { hash });
      return Response.json({ result: { status: "SUCCESS", envelopeXdr: receipt.toXDR() } });
    }
    assert.equal(body.method, "getLatestLedger");
    return Response.json({ result: { sequence: 10000 } });
  });
  t.mock.method(sdk.rpc.Server.prototype, "prepareTransaction", async (transaction: Transaction) => transaction);
  t.mock.method(sdk.rpc.Server.prototype, "sendTransaction", async () => {
    broadcasts++;
    throw new Error("No broadcast is permitted by this local preparation test.");
  });
  const prepared = await client.prepareAllowanceTransaction(
    { ...config, network: "mainnet", rpcUrl: "https://fixture.invalid/rpc" } as Parameters<typeof client.prepareAllowanceTransaction>[0],
    mandate,
    hash,
  );
  const transaction = TransactionBuilder.fromXDR(prepared, Networks.PUBLIC);
  assert.ok("sequence" in transaction);
  assert.equal(transaction.sequence, "102");
  assert.deepEqual(requestedMethods, ["account-sequence", "getTransaction", "getLatestLedger"]);
  assert.equal(broadcasts, 0);
});

test("V2 credentials differ from the registered mandate id; direct original intents remain compatible", async (t) => {
  const { config, mandate, receipt, hash } = fixture();
  mockReceipt(t, hash, { result: { status: "SUCCESS", envelopeXdr: receipt.toXDR() } });
  assert.notEqual(mandate.credentialHash, mandate.idBuffer.toString("hex"));
  assert.equal(await confirmedRegistrationSequence(config, mandate, hash), "101");
  const { credentialHash, ...originalIntent } = mandate;
  assert.equal(await confirmedRegistrationSequence(config, { ...originalIntent, idBuffer: Buffer.from(credentialHash, "hex") }, hash), "101");
});

test("the envelope hash and network must match the requested registration transaction", async (t) => {
  const { config, mandate, receipt, hash } = fixture();
  mockReceipt(t, "f".repeat(64), { result: { status: "SUCCESS", envelopeXdr: receipt.toXDR() } });
  await assert.rejects(confirmedRegistrationSequence(config, mandate, "f".repeat(64)), /different registration transaction/);
  t.mock.restoreAll();
  mockReceipt(t, hash, { result: { status: "SUCCESS", envelopeXdr: receipt.toXDR() } });
  await assert.rejects(confirmedRegistrationSequence({ ...config, networkPassphrase: Networks.PUBLIC }, mandate, hash), /different registration transaction/);
});

test("a different source, registry, function, or operation cannot supply a registration floor", async (t) => {
  const { config, mandate, transaction } = fixture();
  const receipts = [
    transaction({ source: Keypair.random().publicKey() }),
    transaction({ contract: StrKey.encodeContract(Buffer.alloc(32, 3)) }),
    transaction({ functionName: "approve" }),
    transaction({ operation: Operation.manageData({ name: "fixture", value: "not-registration" }) }),
  ];
  for (const receipt of receipts) {
    const hash = receipt.hash().toString("hex");
    mockReceipt(t, hash, { result: { status: "SUCCESS", envelopeXdr: receipt.toXDR() } });
    await assert.rejects(confirmedRegistrationSequence(config, mandate, hash), /does not match this wallet|contract or function|not the expected mandate registration/);
    t.mock.restoreAll();
  }
});

test("all seven registration parameters must match the saved spending rules", async (t) => {
  const { config, mandate, args, transaction } = fixture();
  const replacements = [
    ...[0, 1, 2].map(() => new Address(Keypair.random().publicKey()).toScVal()),
    new Address(StrKey.encodeContract(Buffer.alloc(32, 3))).toScVal(),
    nativeToScVal(2000000n, { type: "i128" }), nativeToScVal(3000n, { type: "u64" }),
    nativeToScVal(Buffer.alloc(32, 5), { type: "bytes" }),
  ];
  const variants = replacements.map((replacement, index) => args.map((value, field) => field === index ? replacement : value));
  variants.push(args.slice(0, 6));
  for (const values of variants) {
    const receipt = transaction({ values });
    const hash = receipt.hash().toString("hex");
    mockReceipt(t, hash, { result: { status: "SUCCESS", envelopeXdr: receipt.toXDR() } });
    await assert.rejects(confirmedRegistrationSequence(config, mandate, hash), /parameters do not match/);
    t.mock.restoreAll();
  }
});

test("not-found, failed, missing-envelope, and JSON-RPC errors never prove registration", async (t) => {
  const { config, mandate, receipt, hash } = fixture();
  for (const body of [
    { result: { status: "NOT_FOUND" } }, { result: { status: "FAILED", envelopeXdr: receipt.toXDR() } },
    { result: { status: "SUCCESS" } }, { error: { code: -32000, message: "Unavailable" } },
  ]) {
    mockReceipt(t, hash, body);
    await assert.rejects(confirmedRegistrationSequence(config, mandate, hash), /has not confirmed/);
    t.mock.restoreAll();
  }
});

test("verified fee-bump registration uses the inner wallet sequence and outer receipt hash", async (t) => {
  const { config, mandate, receipt } = fixture();
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(Keypair.random().publicKey(), "200", receipt, Networks.TESTNET);
  const hash = feeBump.hash().toString("hex");
  mockReceipt(t, hash, { result: { status: "SUCCESS", envelopeXdr: feeBump.toXDR() } });
  assert.equal(await confirmedRegistrationSequence(config, mandate, hash), "101");
});

test("sequence selection is exact above Number precision and rejects malformed inputs", () => {
  assert.equal(selectAllowanceAccountSequence("9007199254740992", "9007199254740993"), "9007199254740993");
  assert.equal(selectAllowanceAccountSequence("9007199254740994", "9007199254740993"), "9007199254740994");
  for (const value of ["", "-1", "1.5", "1e3", "01", "NaN", "Infinity", (1n << 63n).toString()]) {
    assert.throws(() => selectAllowanceAccountSequence(value, "101"));
    assert.throws(() => selectAllowanceAccountSequence("100", value));
  }
  assert.throws(() => selectAllowanceAccountSequence("100", "0"));
});

test("cached allowance sequences must be strictly after confirmed registration", () => {
  const { config, mandate } = fixture();
  const build = (sourceSequence: string) => new TransactionBuilder(new Account(mandate.user, sourceSequence), {
    fee: "100", networkPassphrase: Networks.TESTNET, timebounds: { minTime: 0, maxTime: 1800 },
  }).addOperation(new Contract(mandate.asset).call("approve",
    new Address(mandate.user).toScVal(), new Address(config.mandateRegistryId).toScVal(),
    nativeToScVal(mandate.maxAmount, { type: "i128" }), nativeToScVal(10000, { type: "u32" }),
  )).build().toXDR();
  assert.throws(() => validateAllowanceSequence(build("100"), Networks.TESTNET, "101"), /outdated wallet sequence/);
  assert.throws(() => validateAllowanceSequence(build("99"), Networks.TESTNET, "101"), /outdated wallet sequence/);
  assert.doesNotThrow(() => validateAllowanceSequence(build("101"), Networks.TESTNET, "101"));
  assert.doesNotThrow(() => validateAllowanceSequence(build("103"), Networks.TESTNET, "101"));
});

test("invalid receipt identifiers and a cancelled request do not contact RPC", async (t) => {
  const { config, mandate, hash } = fixture();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("No RPC allowed"); });
  await assert.rejects(confirmedRegistrationSequence(config, mandate, "invalid"), /hash is invalid/);
  await assert.rejects(confirmedRegistrationSequence(config, { ...mandate, credentialHash: "invalid" }, hash), /credential hash/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(confirmedRegistrationSequence(config, mandate, hash, controller.signal), { name: "AbortError" });
  assert.equal(calls, 0);
});

test("the 15-second deadline bounds a hung registration response body", async (t) => {
  const { config, mandate, hash } = fixture();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | null | undefined;
  t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    signal = init?.signal;
    return { ok: true, json: () => new Promise(() => undefined) } as unknown as Response;
  });
  const pending = confirmedRegistrationSequence(config, mandate, hash);
  const rejected = assert.rejects(pending, { name: "TimeoutError" });
  await Promise.resolve();
  t.mock.timers.tick(15_000);
  await rejected;
  assert.equal(signal?.aborted, true);
});
