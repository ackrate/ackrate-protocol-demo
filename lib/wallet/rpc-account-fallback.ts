import { Account, rpc, StrKey } from "@stellar/stellar-sdk";
import { loadAccountSequence } from "./horizon-account";
import type { NetworkName } from "./types";

type RpcGetAccount = (address: string) => Promise<Account>;

const runtime = globalThis as typeof globalThis & {
  __reappMainnetAccountFallbackInstalled?: boolean;
};

function missingAccount(error: unknown, address: string): boolean {
  return error instanceof Error && error.message === `Account not found: ${address}`;
}

export async function accountWithHorizonFallback(
  address: string,
  primary: () => Promise<Account>,
  loadSequence: (address: string) => Promise<string> = (account) => loadAccountSequence(account, "mainnet", false),
): Promise<Account> {
  try {
    return await primary();
  } catch (error) {
    if (!StrKey.isValidEd25519PublicKey(address) || !missingAccount(error, address)) throw error;
    return new Account(address, await loadSequence(address));
  }
}

/**
 * Public Mainnet RPC providers currently omit classic account ledger entries
 * from getLedgerEntries even though the same accounts are live in Horizon.
 * Contract transaction assembly still needs the source sequence, so install a
 * narrow fallback that changes only an exact RPC "Account not found" result.
 * Simulation and submission continue through the manifest-pinned RPC, and the
 * contract remains the authority for every payment.
 */
export function installMainnetAccountFallback(network: NetworkName): void {
  if (network !== "mainnet" || runtime.__reappMainnetAccountFallbackInstalled) return;

  const prototype = rpc.Server.prototype as typeof rpc.Server.prototype & { getAccount: RpcGetAccount };
  const upstream = prototype.getAccount;
  prototype.getAccount = async function getAccountWithHorizon(address: string): Promise<Account> {
    return accountWithHorizonFallback(address, () => upstream.call(this, address));
  };
  runtime.__reappMainnetAccountFallbackInstalled = true;
}
