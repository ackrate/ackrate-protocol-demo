// Disposable testnet only. Never imports production keys or submits to Mainnet.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Address, Asset, Contract, Keypair, Networks, Operation, TransactionBuilder, hash, nativeToScVal, rpc, scValToNative } from "@stellar/stellar-sdk";
const wasmPath = process.argv[2];
if (!wasmPath) throw new Error("Pass the compiled wallet-setup WASM path.");
const server = new rpc.Server("https://soroban-testnet.stellar.org");
const network = Networks.TESTNET;
const owner = Keypair.random(), agent = Keypair.random(), merchant = Keypair.random();
const stateDir = join(homedir(), ".local/share/ackrate/wallet-e2e");
await mkdir(stateDir, {recursive:true,mode:0o700});
const run = Date.now().toString();
await writeFile(join(stateDir, `testnet-${run}.json`), JSON.stringify({network:"testnet",owner:owner.secret(),agent:agent.secret(),merchant:merchant.secret()}), {mode:0o600,flag:"wx"});
const receipts = [];
const addr = (value) => new Address(value).toScVal();
const val = (value,type) => nativeToScVal(value,{type});
const wait = (ms) => new Promise(resolve=>setTimeout(resolve,ms));
async function prepared(operation, signer=owner) {
  const account = await server.getAccount(signer.publicKey());
  const tx = new TransactionBuilder(account,{fee:"100000",networkPassphrase:network}).addOperation(operation).setTimeout(180).build();
  const simulation = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulation)) throw new Error(`Simulation failed: ${JSON.stringify(simulation)}`);
  return {tx:rpc.assembleTransaction(tx,simulation).build(),value:simulation.result && scValToNative(simulation.result.retval)};
}
async function send(label,operation,signer=owner) {
  const {tx} = await prepared(operation,signer); tx.sign(signer);
  const expected=tx.hash().toString("hex");
  const response=await server.sendTransaction(tx);
  assert.equal(response.hash,expected); assert.ok(["PENDING","DUPLICATE"].includes(response.status),response.status);
  for(let i=0;i<45;i++) {
    const result=await server.getTransaction(expected);
    if(result.status==="SUCCESS") { receipts.push({label,hash:expected}); console.log(label,expected); return scValToNative(result.returnValue); }
    if(result.status==="FAILED") throw new Error(`${label} failed: ${expected}`);
    await wait(2000);
  }
  throw new Error(`${label} remains pending: ${expected}; inspect it before any new run.`);
}
for(const key of [owner,agent,merchant]) {
  const response=await fetch(`https://friendbot.stellar.org?addr=${key.publicKey()}`, { signal: AbortSignal.timeout(60_000) }); assert.ok(response.ok,`Friendbot ${response.status}`);
}
console.log("Testnet actors funded",owner.publicKey());
// Copy the exact reviewed Mainnet registry bytecode into an isolated TESTNET deployment.
const publicRpc=new rpc.Server("https://soroban-rpc.mainnet.stellar.gateway.fm");
const registryWasm=await publicRpc.getContractWasmByContractId("CCLZEBJXG4YVJEPBCR5F27N733BCK5HQJWZZGB3K54JVODY3VAGP4HWR");
assert.equal(hash(registryWasm).toString("hex"),"982809197d35d44c7b0fce6bd117fb2fec09b728c64c146c1f803b01faacff62");
const asset=Asset.native().contractId(network);
await send("upload-registry",Operation.uploadContractWasm({wasm:registryWasm}));
const registry=await send("deploy-isolated-registry",Operation.createCustomContract({address:new Address(owner.publicKey()),wasmHash:hash(registryWasm),salt:randomBytes(32),constructorArgs:[addr(owner.publicKey()),addr(asset)]}));
const helperWasm=await readFile(wasmPath);
await send("upload-setup",Operation.uploadContractWasm({wasm:helperWasm}));
const helper=await send("deploy-immutable-setup",Operation.createCustomContract({address:new Address(owner.publicKey()),wasmHash:hash(helperWasm),salt:randomBytes(32),constructorArgs:[addr(registry),addr(asset)]}));
const contract=new Contract(registry), token=new Contract(asset);
const ledger=await server.getLatestLedger(); const expiry=BigInt(Math.floor(Date.now()/1000)+1800);
const setupId=await send("register-and-approve-one-transaction",new Contract(helper).call("register_and_approve",addr(owner.publicKey()),addr(agent.publicKey()),addr(merchant.publicKey()),val(300000n,"i128"),val(expiry,"u64"),val(randomBytes(32),"bytes"),val(ledger.sequence+1000,"u32")));
const allowance=await prepared(token.call("allowance",addr(owner.publicKey()),addr(registry)));
assert.equal(allowance.value,300000n);
assert.equal((await prepared(token.call("allowance",addr(owner.publicKey()),addr(helper)))).value,0n);
const balanceBefore=(await prepared(token.call("balance",addr(merchant.publicKey())))).value;
for(let seq=0;seq<3;seq++) await send(`bounded-payment-${seq+1}`,contract.call("execute_payment",val(setupId,"bytes"),val(100000n,"i128"),val(seq,"u32")),agent);
const mandate=(await prepared(contract.call("get_mandate",val(setupId,"bytes")))).value;
assert.equal(mandate.spent,300000n); assert.equal(mandate.seq,3);
assert.equal((await prepared(token.call("balance",addr(merchant.publicKey())))).value-balanceBefore,300000n);
await assert.rejects(prepared(contract.call("execute_payment",val(setupId,"bytes"),val(100000n,"i128"),val(3,"u32")),agent),/Simulation failed/);
const evidence={network:"testnet",asset:"XLM",registry,helper,helperWasmSha256:hash(helperWasm).toString("hex"),owner:owner.publicKey(),agent:agent.publicKey(),merchant:merchant.publicKey(),mandateId:Buffer.from(setupId).toString("hex"),spent:"300000",seq:3,fourthPayment:"rejected-before-signing-or-broadcast",receipts};
await writeFile(join(stateDir,`testnet-${run}-evidence.json`),JSON.stringify(evidence,null,2)+"\n",{mode:0o600});
console.log("PASS: atomic setup, three payments, fourth rejected; evidence",join(stateDir,`testnet-${run}-evidence.json`));
