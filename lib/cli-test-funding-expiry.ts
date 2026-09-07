import { Buffer } from "node:buffer";
import { Asset, Keypair, StrKey, Transaction, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk";
import { boundedResponseJson } from "./wallet/http";
import { CLI_FUNDING_SECONDS, CLI_MAINNET_HORIZON, CLI_MAINNET_PASSPHRASE, CLI_MAINNET_RPC, CLI_MAX_XDR_LENGTH, CLI_USDC_ISSUER } from "./cli-test-transactions";

export interface CliFundingExpiryContext {
  owner: string; payer: string; agent: string; merchant: string;
  fundingXdr: string; fundingHash: string; fundingExpiresAt: number;
}
export interface CliFundingExpiryReads {
  getLatestHorizonLedger(): Promise<unknown>;
  getNetwork(): Promise<unknown>;
  getLedgerEntries(...keys: xdr.LedgerKey[]): Promise<unknown>;
}
export interface CliFundingExpiryProof {
  readonly kind: "expired-unused";
  readonly originalHash: string;
  readonly owner: string; readonly payer: string; readonly agent: string; readonly merchant: string;
  readonly originalSequence: string; readonly currentOwnerSequence: string;
  readonly maxTime: number; readonly horizonLedger: number; readonly horizonClosedAt: number;
  readonly rpcLedger: number; readonly observedAt: number;
}

const MAX_LEDGER = 0xffff_ffff;
const MAX_SEQUENCE = 0x7fff_ffff_ffff_ffffn;
function positiveInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maximum;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Funding expiry evidence is malformed.");
  return value as Record<string, unknown>;
}

function originalFunding(input: CliFundingExpiryContext) {
  // Snapshot before the first await: later caller mutation cannot change the proof target.
  const row = { owner: input.owner, payer: input.payer, agent: input.agent, merchant: input.merchant,
    fundingXdr: input.fundingXdr, fundingHash: input.fundingHash, fundingExpiresAt: input.fundingExpiresAt };
  if (![row.owner, row.payer, row.agent, row.merchant].every((key) => typeof key === "string" && StrKey.isValidEd25519PublicKey(key))
    || new Set([row.owner, row.payer, row.agent, row.merchant]).size !== 4
    || typeof row.fundingHash !== "string" || !/^[a-f0-9]{64}$/.test(row.fundingHash)
    || typeof row.fundingXdr !== "string" || !row.fundingXdr.length || row.fundingXdr.length > CLI_MAX_XDR_LENGTH
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(row.fundingXdr)
    || Buffer.from(row.fundingXdr, "base64").toString("base64") !== row.fundingXdr) throw new Error("Original funding context is invalid.");
  let tx: Transaction;
  try {
    const parsed = TransactionBuilder.fromXDR(row.fundingXdr, CLI_MAINNET_PASSPHRASE);
    if (!(parsed instanceof Transaction)) throw new Error();
    tx = parsed;
  } catch { throw new Error("Original funding transaction is invalid."); }
  const bounds = tx.timeBounds;
  const minTime = Number(bounds?.minTime);
  const maxTime = Number(bounds?.maxTime);
  if (tx.source !== row.owner || tx.hash().toString("hex") !== row.fundingHash
    || !positiveInteger(minTime) || !positiveInteger(maxTime) || maxTime - minTime !== CLI_FUNDING_SECONDS
    || maxTime !== row.fundingExpiresAt || !positiveInteger(row.fundingExpiresAt)
    || !/^[1-9]\d*$/.test(tx.sequence) || BigInt(tx.sequence) > MAX_SEQUENCE) throw new Error("Original funding identity, sequence, or expiry differs.");
  const [payer, agent, merchant, payerTrust, merchantTrust, payment] = tx.operations;
  const usdc = new Asset("USDC", CLI_USDC_ISSUER);
  if (tx.operations.length !== 6 || tx.fee !== "600" || tx.memo.type !== "none"
    || payer?.type !== "createAccount" || payer.destination !== row.payer || payer.startingBalance !== "2.1000000"
    || agent?.type !== "createAccount" || agent.destination !== row.agent || agent.startingBalance !== "2.1000000"
    || merchant?.type !== "createAccount" || merchant.destination !== row.merchant || merchant.startingBalance !== "1.8000000"
    || payerTrust?.type !== "changeTrust" || payerTrust.source !== row.payer || !(payerTrust.line instanceof Asset) || !payerTrust.line.equals(usdc) || payerTrust.limit !== "0.0300000"
    || merchantTrust?.type !== "changeTrust" || merchantTrust.source !== row.merchant || !(merchantTrust.line instanceof Asset) || !merchantTrust.line.equals(usdc) || merchantTrust.limit !== "0.0300000"
    || payment?.type !== "payment" || payment.destination !== row.payer || !payment.asset.equals(usdc) || payment.amount !== "0.0300000"
    || [payer, agent, merchant, payment].some((op) => op.source && op.source !== row.owner)) throw new Error("Original funding actors, operations, or budget differ.");
  return { row, sequence: tx.sequence, maxTime };
}

function defaultReads(): CliFundingExpiryReads {
  const server = new rpc.Server(CLI_MAINNET_RPC, { allowHttp: false });
  // Configure the actual SDK HTTP client; this SDK constructor does not apply timeout.
  server.httpClient.defaults.timeout = 10_000;
  server.httpClient.defaults.maxContentLength = 256 * 1024;
  server.httpClient.defaults.maxRedirects = 0;
  server.httpClient.defaults.fetchOptions = { redirect: "error", cache: "no-store" };
  return {
    async getLatestHorizonLedger() {
      const response = await fetch(`${CLI_MAINNET_HORIZON}/ledgers?order=desc&limit=1`, {
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Funding expiry ledger service is unavailable.");
      return boundedResponseJson(response, 256 * 1024);
    },
    getNetwork: () => server.getNetwork(),
    getLedgerEntries: (...keys) => server.getLedgerEntries(...keys),
  };
}

/**
 * Read-only evidence, NOT permission to reset a job or sign a replacement.
 * Requires a fresh closed ledger after maxTime and one RPC snapshot in which
 * the owner remains at the predecessor sequence and all three actors are absent.
 * Missing owner data is never treated as proof, including providers that omit
 * classic account entries. No Horizon account fallback is permitted here.
 * RPC fields: https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgerEntries
 */
export async function proveCliFundingExpiredUnused(
  input: CliFundingExpiryContext,
  reads?: CliFundingExpiryReads,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<CliFundingExpiryProof> {
  if (!positiveInteger(nowSeconds)) throw new Error("Funding expiry proof clock is invalid.");
  const { row, sequence, maxTime } = originalFunding(input);
  const services = reads ?? defaultReads();
  let horizon: unknown; let network: unknown;
  try { [horizon, network] = await Promise.all([services.getLatestHorizonLedger(), services.getNetwork()]); }
  catch { throw new Error("Funding expiry network evidence is unavailable."); }
  const identity = object(network);
  if (identity.passphrase !== CLI_MAINNET_PASSPHRASE || "error" in identity) throw new Error("Funding expiry RPC network does not match Mainnet.");
  const records = object(object(horizon)._embedded).records;
  if (!Array.isArray(records) || records.length !== 1) throw new Error("Funding expiry ledger evidence is malformed.");
  const ledger = object(records[0]);
  const closedAt = typeof ledger.closed_at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(ledger.closed_at)
    ? Date.parse(ledger.closed_at) / 1000 : NaN;
  if (!positiveInteger(ledger.sequence, MAX_LEDGER) || !positiveInteger(closedAt)
    || new Date(closedAt * 1000).toISOString().replace(".000Z", "Z") !== ledger.closed_at
    || closedAt > nowSeconds || nowSeconds - closedAt > 120) throw new Error("Funding expiry ledger evidence is stale or invalid.");
  if (closedAt <= maxTime) throw new Error("The original funding transaction is not proven expired.");
  const keys = [row.owner, row.payer, row.agent, row.merchant].map((address) => xdr.LedgerKey.account(
    new xdr.LedgerKeyAccount({ accountId: Keypair.fromPublicKey(address).xdrAccountId() }),
  ));
  let rawEntries: unknown;
  try { rawEntries = await services.getLedgerEntries(...keys); }
  catch { throw new Error("Funding expiry account snapshot is unavailable."); }
  const snapshot = object(rawEntries);
  if (!positiveInteger(snapshot.latestLedger, MAX_LEDGER) || snapshot.latestLedger < ledger.sequence) throw new Error("Funding expiry account snapshot predates the expiry ledger.");
  if (!Array.isArray(snapshot.entries) || snapshot.entries.length !== 1) throw new Error("Funding expiry requires the owner present and all three actors absent.");
  const entry = object(snapshot.entries[0]);
  if (!(entry.key instanceof xdr.LedgerKey) || !(entry.val instanceof xdr.LedgerEntryData)
    || entry.key.toXDR("base64") !== keys[0].toXDR("base64") || entry.val.switch().name !== "account"
    || !positiveInteger(entry.lastModifiedLedgerSeq, MAX_LEDGER) || entry.lastModifiedLedgerSeq > snapshot.latestLedger) throw new Error("Funding expiry owner account evidence is invalid.");
  const account = entry.val.account();
  const ownerSequence = account.seqNum().toString();
  if (account.accountId().toXDR("base64") !== Keypair.fromPublicKey(row.owner).xdrAccountId().toXDR("base64")
    || !/^(?:0|[1-9]\d*)$/.test(ownerSequence) || BigInt(ownerSequence) > MAX_SEQUENCE
    || BigInt(ownerSequence) !== BigInt(sequence) - 1n) throw new Error("Funding expiry owner sequence changed; unused funding is not proven.");
  return Object.freeze({ kind: "expired-unused", originalHash: row.fundingHash,
    owner: row.owner, payer: row.payer, agent: row.agent, merchant: row.merchant,
    originalSequence: sequence, currentOwnerSequence: ownerSequence, maxTime,
    horizonLedger: ledger.sequence, horizonClosedAt: closedAt, rpcLedger: snapshot.latestLedger, observedAt: nowSeconds });
}
