import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as stellar from "@stellar/stellar-sdk";
import * as recovery from "../lib/wallet/registration-recovery";
import * as mandateIds from "../lib/wallet/mandate-id";

const user = stellar.Keypair.random();
const other = stellar.Keypair.random();
const contract = (byte: number) => stellar.StrKey.encodeContract(Buffer.alloc(32, byte));
const wasm = Buffer.from("synthetic-reviewed-helper-bytecode");
const config = { network: "mainnet", networkPassphrase: stellar.Networks.PUBLIC, rpcUrl: "https://fixture.invalid/rpc",
  mandateRegistryId: contract(1), setup: { contractId: contract(2), wasmSha256: stellar.hash(wasm).toString("hex") } };
const intent = { id: "c".repeat(64), idBuffer: Buffer.alloc(32, 0xcc), user: user.publicKey(), agent: other.publicKey(),
  merchant: other.publicKey(), asset: contract(3), maxAmount: 300000n, expiry: Math.floor(Date.now()/1000)+3600, decimals: 7 };
const source = ts.transpileModule(readFileSync(new URL("../lib/wallet/mandate-client.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function harness(options: { wrongCode?: boolean; wrongTarget?: boolean; wrongSigner?: boolean; changedBody?: boolean; loseResponse?: boolean } = {}) {
  const order: string[] = []; let signed: stellar.Transaction | undefined;
  class Server {
    async getContractWasmByContractId(id: string) { assert.equal(id, config.setup.contractId); return options.wrongCode ? Buffer.from("other") : wasm; }
    async simulateTransaction(tx: stellar.Transaction) {
      const op = tx.operations[0] as stellar.Operation.InvokeHostFunction;
      const isConfig = op.func.invokeContract().functionName().toString() === "get_config";
      return { result: { retval: stellar.nativeToScVal(isConfig ? [new stellar.Address(options.wrongTarget ? contract(9) : config.mandateRegistryId), new stellar.Address(intent.asset)] : Buffer.alloc(32, 0xdd)) } };
    }
    async sendTransaction(tx: stellar.Transaction) { order.push("send"); signed = tx; if (options.loseResponse) throw new Error("lost response"); return { status: "PENDING", hash: tx.hash().toString("hex") }; }
    async getTransaction(hash: string) { assert.equal(hash, signed!.hash().toString("hex")); return { status: "SUCCESS" }; }
  }
  const modules: Record<string, unknown> = {
    buffer: { Buffer }, "@stellar/stellar-sdk": { ...stellar, rpc: { Server, Api: { isSimulationSuccess: () => true }, assembleTransaction: (tx: stellar.Transaction) => ({ build: () => tx }) } },
    "@ackrate/stellar": {}, "@ackrate/core": {},
    "./freighter": { freighterSigner: () => ({ signTransaction: async (xdr: string) => {
      order.push("sign"); const original = stellar.TransactionBuilder.fromXDR(xdr, config.networkPassphrase) as stellar.Transaction;
      const tx = options.changedBody ? stellar.TransactionBuilder.cloneFrom(original, { fee: "900000" }).build() : original;
      tx.sign(options.wrongSigner ? other : user); return { signedTxXdr: tx.toXDR(), signerAddress: user.publicKey() };
    } }) },
    "./horizon-account": { loadAccountSequence: async () => "100" }, "./mandate-id": mandateIds,
    "./rpc-retry": { installMainnetRpcRetry: () => {}, retryRateLimited: (fn: () => unknown) => fn() },
    "./client-readiness": {}, "./allowance-sequence": {}, "./registration-recovery": recovery,
  };
  const module = { exports: {} as typeof import("../lib/wallet/mandate-client") };
  vm.runInNewContext(source, { module, exports: module.exports, Error, Date, Buffer, setTimeout,
    fetch: async () => Response.json({ result: { sequence: 100 } }),
    require: (name: string) => { assert.ok(Object.hasOwn(modules,name),name); return modules[name]; },
  });
  let scope: recovery.RegistrationScope; let pending: recovery.PendingRegistration | undefined;
  const run = (failStorage = false) => module.exports.registerRetainedWithFreighter(config as any, intent,
    (id, allowanceExpiration) => { scope = { ...intent, id, credentialHash: intent.id, maxAmount: intent.maxAmount.toString(), setupContractId: config.setup.contractId, allowanceExpiration }; },
    (value) => { order.push("retain"); if (failStorage) throw new Error("storage unavailable"); pending = value; });
  return { order, run, scope: () => scope, pending: () => pending };
}

test("combined setup signs once and retains one receipt before broadcast for both stages", async () => {
  const h = harness(); const result = await h.run();
  assert.deepEqual(h.order, ["sign", "retain", "send"]);
  assert.equal(result.allowanceTransactionHash, result.transactionHash);
  assert.equal(result.transactionHash, h.pending()!.txHash);
  const tx = stellar.TransactionBuilder.fromXDR(h.pending()!.signedTransactionXdr, config.networkPassphrase) as stellar.Transaction;
  assert.equal(tx.operations.length, 1);
  assert.equal(tx.memo.value?.toString(), "ACKRATE: capped USDC setup");
});

test("wrong helper code or targets, substituted transaction, wrong signer and storage failure never broadcast", async () => {
  for (const option of [{wrongCode:true},{wrongTarget:true},{changedBody:true},{wrongSigner:true},{}]) {
    const h = harness(option); await assert.rejects(h.run(Object.keys(option).length===0));
    assert.equal(h.order.includes("send"), false);
    if ('wrongCode' in option || 'wrongTarget' in option) assert.equal(h.order.includes("sign"), false);
  }
});

test("combined receipt survives lost submission response and rejects altered setup scope before recovery", async (t) => {
  const h = harness({loseResponse:true}); await assert.rejects(h.run(), /lost response/);
  assert.deepEqual(h.order, ["sign", "retain", "send"]);
  const pending = h.pending()!; const scope = h.scope();
  for (const change of [{setupContractId:contract(9)},{allowanceExpiration:1},{maxAmount:"1"},{merchant:user.publicKey()}]) {
    assert.throws(() => recovery.signedRegistrationEvidence(pending.signedTransactionXdr, config.networkPassphrase,
      config.mandateRegistryId, {...scope,...change}, pending.submittedAt, config.setup.contractId));
  }
  const meta = new stellar.xdr.TransactionMeta(3, new stellar.xdr.TransactionMetaV3({ext:new stellar.xdr.ExtensionPoint(0),txChangesBefore:[],operations:[],txChangesAfter:[],
    sorobanMeta: new stellar.xdr.SorobanTransactionMeta({ext:new stellar.xdr.SorobanTransactionMetaExt(0),events:[],diagnosticEvents:[],returnValue:stellar.nativeToScVal(Buffer.alloc(32,0xdd))})}));
  t.mock.method(globalThis,"fetch",async (_url: unknown, init: RequestInit) => {
    assert.equal(JSON.parse(String(init.body)).params.hash,pending.txHash);
    return Response.json({result:{status:"SUCCESS",envelopeXdr:pending.signedTransactionXdr,resultMetaXdr:meta.toXDR("base64")}});
  });
  assert.equal(await recovery.readRegistrationConfirmation(config,scope,pending),"confirmed");
  await assert.rejects(recovery.readRegistrationConfirmation({...config,setup:null},scope,pending));
});
