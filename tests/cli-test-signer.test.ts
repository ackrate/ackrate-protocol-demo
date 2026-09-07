import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { Account, Address, Asset, Contract, Keypair, Memo, Networks, Operation, Transaction, TransactionBuilder, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import {
  runCliTestSigner, readCliTestLatestLedger, validateCliPayerTransaction,
  MAINNET_PASSPHRASE, MAINNET_RPC, MAINNET_REGISTRY, USDC_SAC,
} from "../scripts/cli-test-signer.mjs";
import { CLI_MAINNET_PASSPHRASE, CLI_MAINNET_RPC, CLI_MAINNET_REGISTRY, CLI_USDC_SAC } from "../lib/cli-test-transactions";

const execute = promisify(execFile);
const now = 1_800_000_000;
const ledger = 65_000_000;
const payer = Keypair.random();
const agent = Keypair.random();
const merchant = Keypair.random();
const rogue = Keypair.random();
const config = { payer: payer.publicKey(), agent: agent.publicKey(), merchant: merchant.publicKey(), nowSeconds: now };
const env: NodeJS.ProcessEnv = { NODE_ENV: "test", CLI_TEST_PAYER_SECRET: payer.secret(), CLI_TEST_AGENT_SECRET: agent.secret(), CLI_TEST_MERCHANT_PUBLIC_KEY: merchant.publicKey() };
const address = (value: string) => new Address(value).toScVal();
const amount = (value = 300_000n) => nativeToScVal(value, { type: "i128" });
const registration = () => [address(config.payer), address(config.agent), address(config.merchant), address(USDC_SAC), amount(), nativeToScVal(BigInt(now + 3600), { type: "u64" }), nativeToScVal(Buffer.alloc(32, 7), { type: "bytes" })];
const approval = () => [address(config.payer), address(MAINNET_REGISTRY), amount(), nativeToScVal(ledger + 17_280, { type: "u32" })];
function tx(contract = MAINNET_REGISTRY, method = "register_mandate", args = registration(), options: { source?: string; fee?: string; maxTime?: number; minTime?: number; extra?: boolean; memo?: boolean } = {}) {
  const builder = new TransactionBuilder(new Account(options.source ?? config.payer, "100"), { fee: options.fee ?? "100000", networkPassphrase: MAINNET_PASSPHRASE })
    .addOperation(new Contract(contract).call(method, ...args))
    .setTimebounds(options.minTime ?? 0, options.maxTime ?? now + 60);
  if (options.extra) builder.addOperation(Operation.manageData({ name: "extra", value: "no" }));
  if (options.memo) builder.addMemo(Memo.text("unexpected"));
  return builder.build();
}
const signArgs = (transaction: Transaction) => ["tx", "sign", transaction.toXDR(), "--sign-with-key", "cli-payer", "--network-passphrase", MAINNET_PASSPHRASE, "--rpc-url", MAINNET_RPC, "--quiet"];
const options = { env, nowSeconds: now, readLatestLedger: async () => ledger };

test("adapter and funding agree on pinned Mainnet identities", () => {
  assert.deepEqual([MAINNET_PASSPHRASE, MAINNET_RPC, MAINNET_REGISTRY, USDC_SAC], [CLI_MAINNET_PASSPHRASE, CLI_MAINNET_RPC, CLI_MAINNET_REGISTRY, CLI_USDC_SAC]);
});

test("only named payer/agent public keys are exposed; unrelated environment values are never read", async () => {
  const observed: string[] = [];
  const guarded = new Proxy(env, { get(target, property: string) {
    observed.push(property);
    if (!(property in target)) throw new Error("unrelated environment read");
    return target[property as keyof typeof target];
  } });
  assert.equal(await runCliTestSigner(["keys", "public-key", "cli-payer", "--quiet"], { env: guarded }), config.payer);
  assert.equal(await runCliTestSigner(["keys", "public-key", "cli-agent", "--quiet"], { env: guarded }), config.agent);
  assert.deepEqual(observed, ["CLI_TEST_PAYER_SECRET", "CLI_TEST_PAYER_SECRET", "CLI_TEST_AGENT_SECRET", "CLI_TEST_AGENT_SECRET"]);
});

test("actual adapter signs only the exact capped registration and allowance with generated payer key", async () => {
  for (const transaction of [tx(), tx(USDC_SAC, "approve", approval())]) {
    const result = await runCliTestSigner(signArgs(transaction), options);
    const signed = TransactionBuilder.fromXDR(result, MAINNET_PASSPHRASE) as Transaction;
    assert.equal(signed.hash().toString("hex"), transaction.hash().toString("hex"));
    assert.equal(signed.signatures.length, 1);
    assert.ok(payer.verify(signed.hash(), signed.signatures[0].signature()));
    assert.equal(agent.verify(signed.hash(), signed.signatures[0].signature()), false);
  }
});

test("adapter refuses shell/path/extra flags, alternate network/RPC, and agent signing before key access", async () => {
  const valid = signArgs(tx());
  const bad = [[], ["keys", "public-key", "../payer", "--quiet"], ["keys", "public-key", "cli-payer"], ["keys", "public-key", "cli-payer", "--quiet", ";"],
    ["tx", "sign", "file.xdr"], [...valid, "--quiet"], [...valid, "--secret-key", "not-a-secret"],
    valid.map((arg, index) => index === 4 ? "cli-agent" : arg),
    valid.map((arg, index) => index === 6 ? Networks.TESTNET : arg),
    valid.map((arg, index) => index === 8 ? `${MAINNET_RPC}/other` : arg),
  ];
  for (const args of bad) {
    await assert.rejects(runCliTestSigner(args, { env: new Proxy({ NODE_ENV: "test" } as NodeJS.ProcessEnv, { get() { assert.fail("must not read environment"); } }) }), /command is not supported/);
  }
});

test("registration accepts the observed Mainnet resource fee within a fixed half-XLM ceiling", () => {
  for (const fee of ["3035068", "5000000"]) {
    const transaction = tx(MAINNET_REGISTRY, "register_mandate", registration(), { fee });
    assert.equal(validateCliPayerTransaction(transaction.toXDR(), config).method, "register_mandate");
  }
  assert.throws(() => validateCliPayerTransaction(tx(MAINNET_REGISTRY, "register_mandate", registration(), { fee: "5000001" }).toXDR(), config), /fee/);
});

test("registration rejects each changed actor, asset, budget, type, expiry, credential, and extra argument", () => {
  const changes: [number, xdr.ScVal][] = [
    [0, address(rogue.publicKey())], [1, address(rogue.publicKey())], [2, address(rogue.publicKey())], [3, address(MAINNET_REGISTRY)],
    [4, amount(300_001n)], [4, amount(-1n)], [4, amount(1n << 64n)], [4, nativeToScVal(300_000, { type: "u32" })],
    [5, nativeToScVal(BigInt(now), { type: "u64" })], [5, nativeToScVal(BigInt(now + 3701), { type: "u64" })],
    [5, nativeToScVal(BigInt(now + 3600), { type: "i64" })], [6, nativeToScVal(Buffer.alloc(31), { type: "bytes" })],
  ];
  for (const [index, value] of changes) {
    const args = registration(); args[index] = value;
    assert.throws(() => validateCliPayerTransaction(tx(MAINNET_REGISTRY, "register_mandate", args).toXDR(), config), /mandate scope/);
  }
  assert.throws(() => validateCliPayerTransaction(tx(MAINNET_REGISTRY, "register_mandate", [...registration(), amount()]).toXDR(), config), /mandate scope/);
});

test("allowance rejects changed owner/spender/amount/types and stale or excessive ledger expiry", async () => {
  for (const [index, value] of [[0, address(rogue.publicKey())], [1, address(rogue.publicKey())], [2, amount(300_001n)], [2, amount(-1n)], [3, nativeToScVal(BigInt(ledger + 1), { type: "u64" })]] as [number, xdr.ScVal][]) {
    const args = approval(); args[index] = value;
    await assert.rejects(runCliTestSigner(signArgs(tx(USDC_SAC, "approve", args)), { ...options, readLatestLedger: async () => assert.fail("invalid intent must not reach RPC") }), /allowance owner/);
  }
  for (const expiry of [ledger, ledger - 1, ledger + 17_281]) {
    const args = approval(); args[3] = nativeToScVal(expiry, { type: "u32" });
    await assert.rejects(runCliTestSigner(signArgs(tx(USDC_SAC, "approve", args)), options), /ledger expiry/);
  }
  for (const latest of [0, -1, NaN, Infinity, ledger + 0.5]) {
    await assert.rejects(runCliTestSigner(signArgs(tx(USDC_SAC, "approve", approval())), { ...options, readLatestLedger: async () => latest }), /ledger expiry/);
  }
  await assert.rejects(runCliTestSigner(signArgs(tx(USDC_SAC, "approve", approval())), { ...options, readLatestLedger: async () => { throw new Error("RPC unavailable"); } }), /RPC unavailable/);
});

test("adapter refuses arbitrary functions/contracts, classical payments, fee bumps, unsafe fees and time bounds", () => {
  for (const transaction of [tx(MAINNET_REGISTRY, "execute_payment"), tx(USDC_SAC, "transfer"), tx(USDC_SAC),
    tx(MAINNET_REGISTRY, "register_mandate", registration(), { source: config.agent }),
    tx(MAINNET_REGISTRY, "register_mandate", registration(), { fee: "5000001" }),
    tx(MAINNET_REGISTRY, "register_mandate", registration(), { fee: "99" }),
    tx(MAINNET_REGISTRY, "register_mandate", registration(), { maxTime: 0 }),
    tx(MAINNET_REGISTRY, "register_mandate", registration(), { maxTime: now }),
    tx(MAINNET_REGISTRY, "register_mandate", registration(), { maxTime: now + 601 }),
    tx(MAINNET_REGISTRY, "register_mandate", registration(), { minTime: now + 1 }),
    tx(MAINNET_REGISTRY, "register_mandate", registration(), { extra: true }),
    tx(MAINNET_REGISTRY, "register_mandate", registration(), { memo: true }),
  ]) assert.throws(() => validateCliPayerTransaction(transaction.toXDR(), config));
  const signed = tx(); signed.sign(payer);
  assert.throws(() => validateCliPayerTransaction(signed.toXDR(), config), /signatures/);
  const classic = new TransactionBuilder(new Account(config.payer, "1"), { fee: "100", networkPassphrase: MAINNET_PASSPHRASE })
    .addOperation(Operation.payment({ destination: config.agent, asset: Asset.native(), amount: "0.03" }))
    .setTimebounds(0, now + 60).build();
  assert.throws(() => validateCliPayerTransaction(classic.toXDR(), config), /only one payer contract/);
  // A non-contract operation cannot gain setup signing authority.
  assert.throws(() => validateCliPayerTransaction(TransactionBuilder.cloneFrom(tx()).clearOperations()
    .addOperation(Operation.manageData({ name: "not-setup", value: "no" })).build().toXDR(), config), /only one payer contract/);
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(payer, "100000", tx(), MAINNET_PASSPHRASE);
  assert.throws(() => validateCliPayerTransaction(feeBump.toXDR(), config), /normal Stellar transaction/);
  for (const value of ["", "not-xdr", "A".repeat(131_073), `${tx().toXDR()}\n`]) assert.throws(() => validateCliPayerTransaction(value, config));
});

test("adapter checks exact source-account authorization and rejects nested or unrelated invocation authority", () => {
  const base = tx();
  const op = base.operations[0];
  assert.equal(op.type, "invokeHostFunction");
  if (op.type !== "invokeHostFunction") return;
  const invocation = op.func.invokeContract();
  const root = new xdr.SorobanAuthorizedInvocation({ function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(invocation), subInvocations: [] });
  const auth = new xdr.SorobanAuthorizationEntry({ credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(), rootInvocation: root });
  const authorized = TransactionBuilder.cloneFrom(base).clearOperations().addOperation(Operation.invokeHostFunction({ func: op.func, auth: [auth] })).build();
  assert.doesNotThrow(() => validateCliPayerTransaction(authorized.toXDR(), config));
  const wrongSource = TransactionBuilder.cloneFrom(base).clearOperations().addOperation(Operation.invokeHostFunction({ source: config.agent, func: op.func, auth: [] })).build();
  assert.throws(() => validateCliPayerTransaction(wrongSource.toXDR(), config), /only one payer contract/);
  const duplicate = TransactionBuilder.cloneFrom(base).clearOperations().addOperation(Operation.invokeHostFunction({ func: op.func, auth: [auth, auth] })).build();
  assert.throws(() => validateCliPayerTransaction(duplicate.toXDR(), config), /additional authorization/);
  const differentInvocation = new xdr.InvokeContractArgs({
    contractAddress: new Address(USDC_SAC).toScAddress(), functionName: "transfer", args: [],
  });
  const differentAuth = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(differentInvocation), subInvocations: [],
    }),
  });
  const unrelated = TransactionBuilder.cloneFrom(base).clearOperations().addOperation(Operation.invokeHostFunction({ func: op.func, auth: [differentAuth] })).build();
  assert.throws(() => validateCliPayerTransaction(unrelated.toXDR(), config), /unrelated or nested authorization/);
  root.subInvocations([new xdr.SorobanAuthorizedInvocation({ function: root.function(), subInvocations: [] })]);
  const nested = TransactionBuilder.cloneFrom(base).clearOperations().addOperation(Operation.invokeHostFunction({ func: op.func, auth: [auth] })).build();
  assert.throws(() => validateCliPayerTransaction(nested.toXDR(), config), /nested authorization/);
});

test("approval RPC uses only pinned endpoint with bounded timeout and checks Mainnet before ledger", async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, MAINNET_RPC);
    assert.equal(init.redirect, "error");
    assert.ok(init.signal);
    const request = JSON.parse(String(init.body));
    calls.push(request.method);
    assert.equal(init.cache, "no-store");
    assert.deepEqual(Object.keys(request).sort(), ["id", "jsonrpc", "method"]);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: request.method === "getNetwork" ? { passphrase: MAINNET_PASSPHRASE } : { status: "healthy", latestLedger: ledger } }));
  });
  assert.equal(await readCliTestLatestLedger(), ledger);
  assert.deepEqual(calls, ["getNetwork", "getHealth"]);
});

test("wrong network, malformed ledger, and failed RPC never yield approval evidence", async (t) => {
  let signatures = 0;
  t.mock.method(Keypair.prototype, "sign", () => { signatures += 1; assert.fail("bad RPC must not sign"); });
  for (const result of [{ passphrase: Networks.TESTNET }, { passphrase: MAINNET_PASSPHRASE, sequence: NaN }]) {
    let calls = 0;
    const mocked = t.mock.method(globalThis, "fetch", async () => {
      calls += 1;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: calls === 1 ? { passphrase: result.passphrase } : { status: "healthy", latestLedger: result.sequence } }));
    });
    await assert.rejects(readCliTestLatestLedger(), /network|ledger/);
    assert.equal(calls, result.passphrase === Networks.TESTNET ? 1 : 2);
    calls = 0;
    await assert.rejects(runCliTestSigner(signArgs(tx(USDC_SAC, "approve", approval())), { env, nowSeconds: now }), /network|ledger/);
    mocked.mock.restore();
  }
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  await assert.rejects(readCliTestLatestLedger(), /unavailable/);
  await assert.rejects(runCliTestSigner(signArgs(tx(USDC_SAC, "approve", approval())), { env, nowSeconds: now }), /unavailable/);
  assert.equal(signatures, 0);
});

test("allowance signing uses compact health when default latest-ledger metadata exceeds the response bound", async (t) => {
  const defaultLatestLedger = { id: "a".repeat(64), protocolVersion: 27, sequence: ledger, closeTime: String(now),
    headerXdr: "AAAA", metadataXdr: "A".repeat(150_000) };
  assert.ok(Buffer.byteLength(JSON.stringify(defaultLatestLedger)) > 65_536);
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, MAINNET_RPC);
    const request = JSON.parse(String(init.body)); calls.push(request.method);
    const result = request.method === "getNetwork" ? { passphrase: MAINNET_PASSPHRASE, protocolVersion: 27 }
      : request.method === "getHealth" ? { status: "healthy", latestLedger: ledger, latestLedgerCloseTime: String(now),
        oldestLedger: ledger - 17_280, oldestLedgerCloseTime: String(now - 86_400), ledgerRetentionWindow: 17_281 }
      : defaultLatestLedger;
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
  });
  const unsigned = tx(USDC_SAC, "approve", approval());
  const signed = TransactionBuilder.fromXDR(await runCliTestSigner(signArgs(unsigned), { env, nowSeconds: now }), MAINNET_PASSPHRASE) as Transaction;
  assert.equal(signed.hash().toString("hex"), unsigned.hash().toString("hex"));
  assert.equal(signed.signatures.length, 1); assert.ok(payer.verify(signed.hash(), signed.signatures[0].signature()));
  assert.deepEqual(calls, ["getNetwork", "getHealth"]);
});

test("health identity, error, status, and ledger validation fail closed before any signature", async (t) => {
  let signatures = 0;
  t.mock.method(Keypair.prototype, "sign", () => { signatures++; assert.fail("invalid health evidence cannot sign"); });
  const results = [
    ...[0, -1, null, "65000000", 1.5, 0x1_0000_0000].map((latestLedger) => ({ jsonrpc: "2.0", id: 1, result: { status: "healthy", latestLedger } })),
    { jsonrpc: "2.0", id: 1, result: { status: "unhealthy", latestLedger: ledger } },
    { jsonrpc: "2.0", id: 1, result: { latestLedger: ledger } },
    { jsonrpc: "1.0", id: 1, result: { status: "healthy", latestLedger: ledger } },
    { jsonrpc: "2.0", id: 2, result: { status: "healthy", latestLedger: ledger } },
    { jsonrpc: "2.0", id: 1, error: null, result: { status: "healthy", latestLedger: ledger } },
    { jsonrpc: "2.0", id: 1, error: { code: -32000, message: "synthetic service failure" } },
    { jsonrpc: "2.0", id: 1, result: [] },
  ];
  for (const health of results) {
    const mocked = t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => new Response(JSON.stringify(
      JSON.parse(String(init.body)).method === "getNetwork" ? { jsonrpc: "2.0", id: 1, result: { passphrase: MAINNET_PASSPHRASE } } : health,
    )));
    await assert.rejects(runCliTestSigner(signArgs(tx(USDC_SAC, "approve", approval())), { env, nowSeconds: now }), /RPC.*invalid/);
    mocked.mock.restore();
  }
  assert.equal(signatures, 0);
});

test("oversized or malformed RPC bodies remain bounded even when content length is absent", async (t) => {
  for (const declared of [true, false]) {
    let cancelled = false;
    const mocked = t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("A".repeat(65_537))); },
      cancel() { cancelled = true; },
    }), { headers: declared ? { "content-length": "65537" } : undefined }));
    await assert.rejects(readCliTestLatestLedger(), /RPC response is invalid/);
    assert.equal(cancelled, true); mocked.mock.restore();
  }
  t.mock.method(globalThis, "fetch", async () => new Response("not JSON"));
  await assert.rejects(readCliTestLatestLedger(), /RPC response is invalid/);
});

test("script runs as an external executable and signs generated-key registration without network", async () => {
  const script = new URL("../scripts/cli-test-signer.mjs", import.meta.url);
  const publicResult = await execute(process.execPath, [script.pathname, "keys", "public-key", "cli-payer", "--quiet"], { env });
  assert.equal(publicResult.stdout.trim(), config.payer);
  const current = Math.floor(Date.now() / 1000);
  const args = registration(); args[5] = nativeToScVal(BigInt(current + 3600), { type: "u64" });
  const unsigned = tx(MAINNET_REGISTRY, "register_mandate", args, { maxTime: current + 60 });
  const result = await execute(process.execPath, [script.pathname, ...signArgs(unsigned)], { env });
  const signed = TransactionBuilder.fromXDR(result.stdout.trim(), MAINNET_PASSPHRASE) as Transaction;
  assert.ok(payer.verify(signed.hash(), signed.signatures[0].signature()));
  assert.equal(result.stderr, "");
});

test("a PATH symlink resolves the trusted signer and SDK from an isolated run directory without exposing generated seeds", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ackrate-cli-signer-symlink-"));
  const executable = join(directory, "stellar");
  await symlink(fileURLToPath(new URL("../scripts/cli-test-signer.mjs", import.meta.url)), executable);
  const childEnv = { ...env, PATH: `${directory}:${dirname(process.execPath)}` };
  try {
    for (const [identity, publicKey] of [["cli-payer", config.payer], ["cli-agent", config.agent]]) {
      const result = await execute("stellar", ["keys", "public-key", identity, "--quiet"], { cwd: directory, env: childEnv });
      assert.equal(result.stdout, `${publicKey}\n`);
      assert.equal(result.stderr, "");
      assert.equal(/S[A-Z2-7]{55}/.test(result.stdout + result.stderr), false);
    }
    const current = Math.floor(Date.now() / 1000);
    const args = registration(); args[5] = nativeToScVal(BigInt(current + 3600), { type: "u64" });
    const unsigned = tx(MAINNET_REGISTRY, "register_mandate", args, { maxTime: current + 60 });
    const result = await execute("stellar", signArgs(unsigned), { cwd: directory, env: childEnv });
    const signed = TransactionBuilder.fromXDR(result.stdout.trim(), MAINNET_PASSPHRASE) as Transaction;
    assert.equal(signed.hash().toString("hex"), unsigned.hash().toString("hex"));
    assert.ok(payer.verify(signed.hash(), signed.signatures[0].signature()));
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.includes(payer.secret()) || result.stdout.includes(agent.secret()), false);
    await assert.rejects(execute("stellar", ["tx", "sign", "../arbitrary.xdr"], { cwd: directory, env: childEnv }), (error: unknown) => {
      const failed = error as { stdout: string; stderr: string };
      assert.equal(failed.stdout, "");
      assert.match(failed.stderr, /command is not supported/);
      assert.equal(/S[A-Z2-7]{55}/.test(failed.stderr), false);
      return true;
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
