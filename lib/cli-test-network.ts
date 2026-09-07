import { Account, StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";
import type { CliTestRow, CliTestStore } from "./cli-test-store";
import { CLI_MAINNET_HORIZON, CLI_MAINNET_PASSPHRASE, CLI_MAINNET_RPC, CLI_USDC_ISSUER } from "./cli-test-transactions";
import { boundedResponseJson } from "./wallet/http";

const GAddress = z.string().refine(StrKey.isValidEd25519PublicKey);

export class CliTestNetworkError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

async function readJson(url: string, options: RequestInit = {}) {
  const response = await fetch(url, { ...options, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("public network service unavailable");
  return boundedResponseJson(response, 256 * 1024);
}

const decimal = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/).max(40);
const count = z.number().int().min(0).max(0xffff_ffff);
const Balance = z.object({
  asset_type: z.string(), asset_code: z.string().optional(), asset_issuer: z.string().optional(),
  balance: decimal, selling_liabilities: decimal, buying_liabilities: decimal,
  is_authorized: z.boolean().optional(),
});
const HorizonAccount = z.object({ account_id: GAddress, sequence: z.string().regex(/^\d+$/).max(20),
  subentry_count: count, num_sponsoring: count, num_sponsored: count, balances: z.array(Balance).max(1000) });
const stroops = (value: string) => { const [whole, fraction = ""] = value.split("."); return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0")); };

export async function ownerFundingSnapshot(owner: string): Promise<Account> {
  const [rawAccount, rawLedgers, rawNetwork] = await Promise.all([
    readJson(`${CLI_MAINNET_HORIZON}/accounts/${owner}`),
    readJson(`${CLI_MAINNET_HORIZON}/ledgers?order=desc&limit=1`),
    readJson(CLI_MAINNET_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getNetwork" }) }),
  ]);
  const network = z.object({ jsonrpc: z.literal("2.0"), id: z.literal(1), result: z.object({ passphrase: z.literal(CLI_MAINNET_PASSPHRASE) }) }).passthrough().parse(rawNetwork);
  if ("error" in network) throw new Error("invalid network identity");
  const account = HorizonAccount.parse(rawAccount);
  const ledger = z.object({ _embedded: z.object({ records: z.array(z.object({ sequence: count, base_reserve_in_stroops: count, closed_at: z.string() })).length(1) }) }).parse(rawLedgers)._embedded.records[0];
  if (account.account_id !== owner || BigInt(account.sequence) <= 0n || BigInt(account.sequence) > 0x7fff_ffff_ffff_ffffn
    || ledger.sequence <= 0 || ledger.base_reserve_in_stroops <= 0 || !Number.isFinite(Date.parse(ledger.closed_at))
    || Math.abs(Date.now() - Date.parse(ledger.closed_at)) > 120_000) throw new Error("invalid funding snapshot");
  const native = account.balances.filter((balance) => balance.asset_type === "native");
  const usdc = account.balances.filter((balance) => balance.asset_type === "credit_alphanum4" && balance.asset_code === "USDC" && balance.asset_issuer === CLI_USDC_ISSUER);
  if (native.length !== 1 || usdc.length !== 1 || usdc[0].is_authorized !== true) throw new CliTestNetworkError("The connected account needs a fully authorized Circle USDC trustline with at least 0.03 sendable USDC.");
  const units = 2n + BigInt(account.subentry_count) + BigInt(account.num_sponsoring) - BigInt(account.num_sponsored);
  if (units < 0n || stroops(native[0].selling_liabilities) > stroops(native[0].balance)
    || stroops(usdc[0].selling_liabilities) > stroops(usdc[0].balance)) throw new Error("invalid funding liabilities");
  const spendable = stroops(native[0].balance) - BigInt(ledger.base_reserve_in_stroops) * units - stroops(native[0].selling_liabilities);
  if (spendable < 60_000_600n) throw new CliTestNetworkError("The connected account needs at least 6.00006 spendable XLM above account reserves and selling liabilities.");
  if (stroops(usdc[0].balance) - stroops(usdc[0].selling_liabilities) < 300_000n) throw new CliTestNetworkError("The connected account needs at least 0.03 sendable Circle USDC after selling liabilities.");
  return new Account(owner, account.sequence);
}

export async function reconcileFunding(store: CliTestStore, row: CliTestRow, token: string): Promise<CliTestRow> {
  if (row.state !== "funding" || !row.fundingHash) return row;
  try {
    const response = await fetch(`${CLI_MAINNET_HORIZON}/transactions/${row.fundingHash}`, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (response.status === 404) return row;
    if (!response.ok) return row;
    const evidence = z.object({ hash: z.string(), source_account: GAddress, successful: z.boolean() }).parse(await boundedResponseJson(response));
    if (evidence.hash !== row.fundingHash || evidence.source_account !== row.owner) return row;
    return await store.update(row.id, token, row.version, evidence.successful
      ? { state: "funded", logs: `${row.logs}\nFunding confirmed: https://stellar.expert/explorer/public/tx/${row.fundingHash}\n` }
      : { state: "failed", error: "The exact funding transaction failed on-chain. This run will not be retried automatically.", finishedAt: Math.floor(Date.now() / 1000) });
  } catch {
    // RPC ambiguity and CAS conflicts never authorize another transaction.
    return await store.read(row.id, token) ?? row;
  }
}
