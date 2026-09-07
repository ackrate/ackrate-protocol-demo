import { Keypair, StrKey, Transaction, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk";
import { boundedResponseJson } from "./wallet/http";
import { CLI_MAINNET_HORIZON, CLI_MAINNET_PASSPHRASE, CLI_MAINNET_RPC, CLI_MAX_XDR_LENGTH, verifyCliFundingSigned } from "./cli-test-transactions";

export interface CliUnstartedContext {
  id: string; state: "failed"; finishedAt: number; fundingHash: string;
  owner: string; payer: string; agent: string; merchant: string;
}
export interface CliUnstartedProof {
  readonly kind: "funded-unstarted"; readonly runId: string; readonly fundingHash: string;
  readonly owner: string; readonly payer: string; readonly agent: string; readonly merchant: string;
  readonly finishedAt: number; readonly fundingLedger: number; readonly initialActorSequence: string;
  readonly horizonLedger: number; readonly horizonClosedAt: number; readonly rpcLedger: number; readonly observedAt: number;
}
export interface CliUnstartedReads {
  getFundingTransaction(hash: string): Promise<unknown>;
  getLatestHorizonLedger(): Promise<unknown>;
  getNetwork(): Promise<unknown>;
  getLedgerEntries(...keys: xdr.LedgerKey[]): Promise<unknown>;
}
const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= max;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unstarted test evidence is malformed.");
  return value as Record<string, unknown>;
}
function timestamp(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().replace(".000Z", "Z") === value ? parsed / 1000 : NaN;
}
function defaultReads(): CliUnstartedReads {
  const server = new rpc.Server(CLI_MAINNET_RPC, { allowHttp: false });
  server.httpClient.defaults.timeout = 10_000;
  server.httpClient.defaults.maxContentLength = 256 * 1024;
  server.httpClient.defaults.maxRedirects = 0;
  server.httpClient.defaults.fetchOptions = { redirect: "error", cache: "no-store" };
  async function read(path: string) {
    const response = await fetch(`${CLI_MAINNET_HORIZON}${path}`, {
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Unstarted test chain evidence is unavailable.");
    return boundedResponseJson(response, 256 * 1024);
  }
  return {
    getFundingTransaction: (hash) => read(`/transactions/${hash}`),
    getLatestHorizonLedger: () => read("/ledgers?order=desc&limit=1"),
    getNetwork: () => server.getNetwork(),
    getLedgerEntries: (...keys) => server.getLedgerEntries(...keys),
  };
}

/** Read-only, trusted-provider evidence. This function cannot reset or launch a
 * test. Every actor must still have its creation sequence in one RPC snapshot,
 * after every packet the failed process could have prepared has expired. */
export async function proveCliTestUnstarted(input: CliUnstartedContext, reads?: CliUnstartedReads,
  nowSeconds = Math.floor(Date.now() / 1000)): Promise<CliUnstartedProof> {
  const row = { ...input };
  if (row.state !== "failed" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.id)
    || !/^[a-f0-9]{64}$/.test(row.fundingHash) || !integer(row.finishedAt) || !integer(nowSeconds)
    || nowSeconds <= row.finishedAt + 600
    || ![row.owner, row.payer, row.agent, row.merchant].every((address) => typeof address === "string" && StrKey.isValidEd25519PublicKey(address))
    || new Set([row.owner, row.payer, row.agent, row.merchant]).size !== 4) throw new Error("Unstarted test context is invalid or not yet expired.");
  const services = reads ?? defaultReads();
  let fundingRaw: unknown; let ledgerRaw: unknown; let networkRaw: unknown;
  try { [fundingRaw, ledgerRaw, networkRaw] = await Promise.all([
    services.getFundingTransaction(row.fundingHash), services.getLatestHorizonLedger(), services.getNetwork(),
  ]); } catch { throw new Error("Unstarted test chain evidence is unavailable."); }
  const network = object(networkRaw);
  if ("error" in network || network.passphrase !== CLI_MAINNET_PASSPHRASE) throw new Error("Unstarted test network is not Mainnet.");
  const funding = object(fundingRaw);
  const fundingTime = timestamp(funding.created_at);
  if (funding.hash !== row.fundingHash || funding.source_account !== row.owner || funding.successful !== true
    || !integer(funding.ledger, 0x7fff_ffff) || !integer(fundingTime) || fundingTime > row.finishedAt
    || typeof funding.envelope_xdr !== "string" || funding.envelope_xdr.length > CLI_MAX_XDR_LENGTH) throw new Error("Exact successful funding is not verified.");
  // Recover the two-signature prepared form only for local validation. No
  // transaction is signed here, and no envelope is returned or submitted.
  try {
    const parsed = TransactionBuilder.fromXDR(funding.envelope_xdr, CLI_MAINNET_PASSPHRASE);
    if (!(parsed instanceof Transaction) || parsed.hash().toString("hex") !== row.fundingHash) throw new Error();
    const owner = Keypair.fromPublicKey(row.owner);
    const retained = parsed.signatures.filter((signature) => !owner.verify(parsed.hash(), signature.signature()));
    parsed.signatures.splice(0, parsed.signatures.length, ...retained);
    const original = verifyCliFundingSigned(parsed.toXDR(), funding.envelope_xdr, row.owner, Number(parsed.timeBounds?.minTime));
    const [payer, agent, merchant] = original.operations;
    if (payer.type !== "createAccount" || payer.destination !== row.payer
      || agent.type !== "createAccount" || agent.destination !== row.agent
      || merchant.type !== "createAccount" || merchant.destination !== row.merchant) throw new Error();
  } catch { throw new Error("Funding signatures, actors, or capped operations differ."); }
  const records = object(object(ledgerRaw)._embedded).records;
  if (!Array.isArray(records) || records.length !== 1) throw new Error("Unstarted test ledger evidence is malformed.");
  const ledger = object(records[0]); const closedAt = timestamp(ledger.closed_at);
  if (!integer(ledger.sequence, 0xffff_ffff) || ledger.sequence < funding.ledger || !integer(closedAt)
    || closedAt <= row.finishedAt + 600 || closedAt > nowSeconds || nowSeconds - closedAt > 120) throw new Error("Unstarted test ledger is stale or prior packets have not expired.");
  const actors = [row.payer, row.agent, row.merchant];
  const keys = actors.map((address) => xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: Keypair.fromPublicKey(address).xdrAccountId() })));
  let snapshotRaw: unknown;
  try { snapshotRaw = await services.getLedgerEntries(...keys); } catch { throw new Error("Unstarted test account snapshot is unavailable."); }
  const snapshot = object(snapshotRaw);
  if (!integer(snapshot.latestLedger, 0xffff_ffff) || snapshot.latestLedger < ledger.sequence
    || !Array.isArray(snapshot.entries) || snapshot.entries.length !== 3) throw new Error("Unstarted test requires all three actors in one current snapshot.");
  const initialSequence = (BigInt(funding.ledger) << 32n).toString();
  const remaining = new Set(keys.map((key) => key.toXDR("base64")));
  for (const raw of snapshot.entries) {
    const entry = object(raw);
    if (!(entry.key instanceof xdr.LedgerKey) || !(entry.val instanceof xdr.LedgerEntryData)
      || !integer(entry.lastModifiedLedgerSeq, 0xffff_ffff) || entry.lastModifiedLedgerSeq < funding.ledger
      || entry.lastModifiedLedgerSeq > snapshot.latestLedger || entry.val.switch().name !== "account") throw new Error("Unstarted test actor evidence is invalid.");
    const encoded = entry.key.toXDR("base64"); const index = keys.findIndex((key) => key.toXDR("base64") === encoded);
    if (index < 0 || !remaining.delete(encoded)) throw new Error("Unstarted test actor snapshot has mismatched or duplicate keys.");
    const account = entry.val.account();
    if (account.accountId().toXDR("base64") !== Keypair.fromPublicKey(actors[index]).xdrAccountId().toXDR("base64")
      || account.seqNum().toString() !== initialSequence) throw new Error("An actor sequence changed; this test cannot restart.");
  }
  if (remaining.size !== 0) throw new Error("Unstarted test actor evidence is incomplete.");
  return Object.freeze({ kind: "funded-unstarted", runId: row.id, fundingHash: row.fundingHash,
    owner: row.owner, payer: row.payer, agent: row.agent, merchant: row.merchant,
    finishedAt: row.finishedAt, fundingLedger: funding.ledger, initialActorSequence: initialSequence,
    horizonLedger: ledger.sequence, horizonClosedAt: closedAt, rpcLedger: snapshot.latestLedger, observedAt: nowSeconds });
}
