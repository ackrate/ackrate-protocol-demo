#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Address, Keypair, StrKey, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

export const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";
export const MAINNET_RPC = "https://mainnet.sorobanrpc.com";
export const MAINNET_REGISTRY = "CCLZEBJXG4YVJEPBCR5F27N733BCK5HQJWZZGB3K54JVODY3VAGP4HWR";
export const USDC_SAC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const MAX_XDR_LENGTH = 131_072;
const MAX_FEE = 1_000_000n; // 0.10 XLM, including Soroban resource fees.
const BUDGET = 300_000n;
const APPROVAL_LEDGER_WINDOW = 17_280; // Published CLI token helper's default.

function requirePublicKey(value) {
  if (typeof value !== "string" || !StrKey.isValidEd25519PublicKey(value)) throw new Error("CLI test signer actor configuration is invalid");
  return value;
}

function namedKey(env, name) {
  try {
    if (typeof env[name] !== "string") throw new Error("missing key");
    return Keypair.fromSecret(env[name]);
  } catch { throw new Error(`CLI test signer requires a valid ${name}`); }
}

function parseTransaction(value) {
  if (typeof value !== "string" || !value.length || value.length > MAX_XDR_LENGTH
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || Buffer.from(value, "base64").toString("base64") !== value) {
    throw new Error("CLI test signer transaction encoding or size is invalid");
  }
  try {
    const tx = TransactionBuilder.fromXDR(value, MAINNET_PASSPHRASE);
    if (!(tx instanceof Transaction)) throw new Error("not a normal transaction");
    return tx;
  } catch { throw new Error("CLI test signer requires a normal Stellar transaction"); }
}

function addressArgument(value, expected) {
  return value?.switch().name === "scvAddress" && Address.fromScVal(value).toString() === expected;
}

function requireInvocationAuth(op, invocation) {
  const auth = op.auth ?? [];
  if (auth.length > 1) throw new Error("CLI test signer refuses additional authorization entries");
  for (const entry of auth) {
    const root = entry.rootInvocation();
    if (entry.credentials().switch().name !== "sorobanCredentialsSourceAccount"
      || root.function().switch().name !== "sorobanAuthorizedFunctionTypeContractFn"
      || !root.function().contractFn().toXDR().equals(invocation.toXDR())
      || root.subInvocations().length !== 0) {
      throw new Error("CLI test signer refuses unrelated or nested authorization");
    }
  }
}

/** Validate exact setup authority before any RPC call or signature is produced. */
export function validateCliPayerTransaction(transactionXdr, { payer, agent, merchant, nowSeconds = Math.floor(Date.now() / 1000) }) {
  for (const address of [payer, agent, merchant]) requirePublicKey(address);
  if (new Set([payer, agent, merchant]).size !== 3) throw new Error("CLI test signer actors must be distinct");
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) throw new Error("CLI test signer clock is invalid");
  const tx = parseTransaction(transactionXdr);
  const bounds = tx.timeBounds;
  if (tx.source !== payer || tx.operations.length !== 1 || tx.signatures.length !== 0
    || tx.memo.type !== "none" || BigInt(tx.fee) < 100n || BigInt(tx.fee) > MAX_FEE
    || !bounds || BigInt(bounds.minTime) > BigInt(nowSeconds)
    || BigInt(bounds.maxTime) <= BigInt(nowSeconds) || BigInt(bounds.maxTime) > BigInt(nowSeconds + 600)) {
    throw new Error("CLI test signer refuses transaction source, signatures, operations, fee, or time bounds");
  }
  const op = tx.operations[0];
  if (op.type !== "invokeHostFunction" || (op.source && op.source !== payer)
    || op.func.switch().name !== "hostFunctionTypeInvokeContract") {
    throw new Error("CLI test signer permits only one payer contract invocation");
  }
  const invocation = op.func.invokeContract();
  const contract = Address.fromScAddress(invocation.contractAddress()).toString();
  const method = invocation.functionName().toString();
  const args = invocation.args();
  requireInvocationAuth(op, invocation);
  if (contract === MAINNET_REGISTRY && method === "register_mandate") {
    if (args.length !== 7 || !addressArgument(args[0], payer) || !addressArgument(args[1], agent)
      || !addressArgument(args[2], merchant) || !addressArgument(args[3], USDC_SAC)
      || args[4].switch().name !== "scvI128" || args[4].i128().hi().toString() !== "0" || args[4].i128().lo().toString() !== BUDGET.toString()
      || args[5].switch().name !== "scvU64" || BigInt(args[5].u64().toString()) <= BigInt(nowSeconds)
      || BigInt(args[5].u64().toString()) > BigInt(nowSeconds + 3700)
      || args[6].switch().name !== "scvBytes" || args[6].bytes().length !== 32) {
      throw new Error("CLI test signer refuses mandate scope, budget, credential, or expiry");
    }
    return { transaction: tx, method };
  }
  if (contract === USDC_SAC && method === "approve") {
    if (args.length !== 4 || !addressArgument(args[0], payer) || !addressArgument(args[1], MAINNET_REGISTRY)
      || args[2].switch().name !== "scvI128" || args[2].i128().hi().toString() !== "0" || args[2].i128().lo().toString() !== BUDGET.toString()
      || args[3].switch().name !== "scvU32") {
      throw new Error("CLI test signer refuses allowance owner, spender, amount, or expiry");
    }
    return { transaction: tx, method, expirationLedger: args[3].u32() };
  }
  throw new Error("CLI test signer refuses this contract or function");
}

/** Read only the pinned public RPC; redirects, wrong-network data, and failures close signing. */
export async function readCliTestLatestLedger() {
  const signal = AbortSignal.timeout(8_000);
  async function read(method) {
    const response = await fetch(MAINNET_RPC, {
      method: "POST", redirect: "error", signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method }),
    });
    if (!response.ok) throw new Error("CLI test signer RPC is unavailable");
    const body = await response.text();
    if (body.length > 65_536) throw new Error("CLI test signer RPC response is invalid");
    let data;
    try { data = JSON.parse(body); } catch { throw new Error("CLI test signer RPC response is invalid"); }
    if (data?.jsonrpc !== "2.0" || data.id !== 1 || data.error || !data.result) throw new Error("CLI test signer RPC response is invalid");
    return data.result;
  }
  const network = await read("getNetwork");
  if (network.passphrase !== MAINNET_PASSPHRASE) throw new Error("CLI test signer RPC network does not match Mainnet");
  const latest = await read("getLatestLedger");
  if (!Number.isSafeInteger(latest.sequence) || latest.sequence <= 0 || latest.sequence > 0xffff_ffff) {
    throw new Error("CLI test signer RPC ledger is invalid");
  }
  return latest.sequence;
}

/** Minimal external Stellar CLI surface. No arbitrary identity, path, or command is accepted. */
export async function runCliTestSigner(args, { env = process.env, nowSeconds = Math.floor(Date.now() / 1000), readLatestLedger = readCliTestLatestLedger } = {}) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) throw new Error("CLI test signer command is not supported");
  if (args.length === 4 && args[0] === "keys" && args[1] === "public-key" && args[3] === "--quiet"
    && (args[2] === "cli-payer" || args[2] === "cli-agent")) {
    return namedKey(env, args[2] === "cli-payer" ? "CLI_TEST_PAYER_SECRET" : "CLI_TEST_AGENT_SECRET").publicKey();
  }
  if (args.length !== 10 || args[0] !== "tx" || args[1] !== "sign" || args[3] !== "--sign-with-key"
    || args[4] !== "cli-payer" || args[5] !== "--network-passphrase" || args[6] !== MAINNET_PASSPHRASE
    || args[7] !== "--rpc-url" || args[8] !== MAINNET_RPC || args[9] !== "--quiet") {
    throw new Error("CLI test signer command is not supported");
  }
  const payerKey = namedKey(env, "CLI_TEST_PAYER_SECRET");
  const agent = namedKey(env, "CLI_TEST_AGENT_SECRET").publicKey();
  const validated = validateCliPayerTransaction(args[2], {
    payer: payerKey.publicKey(), agent, merchant: env.CLI_TEST_MERCHANT_PUBLIC_KEY, nowSeconds,
  });
  if (validated.method === "approve") {
    const latest = await readLatestLedger();
    if (!Number.isSafeInteger(latest) || latest <= 0 || latest > 0xffff_ffff
      || validated.expirationLedger <= latest || validated.expirationLedger > latest + APPROVAL_LEDGER_WINDOW) {
      throw new Error("CLI test signer refuses allowance ledger expiry");
    }
  }
  validated.transaction.sign(payerKey);
  return validated.transaction.toXDR();
}

let isMain = false;
try { isMain = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* Imported module. */ }
if (isMain) {
  try { process.stdout.write(`${await runCliTestSigner(process.argv.slice(2))}\n`); }
  catch (error) {
    // Errors are intentionally local policy messages; never print argv or env.
    process.stderr.write(`CLI test signer refused: ${error instanceof Error ? error.message : "invalid request"}\n`);
    process.exitCode = 1;
  }
}
