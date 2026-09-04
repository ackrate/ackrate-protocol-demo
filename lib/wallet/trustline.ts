import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import type { AppConfig } from "./app-config";

interface BalanceLine {
  asset_type?: unknown;
  asset_code?: unknown;
  asset_issuer?: unknown;
}

const runtime = globalThis as typeof globalThis & {
  __ackrateTrustlineSetup?: Map<string, Promise<string | null>>;
};

runtime.__ackrateTrustlineSetup ??= new Map();

export function hasAssetTrustline(
  balances: readonly BalanceLine[],
  code: string,
  issuer: string,
): boolean {
  return balances.some((balance) => (
    balance.asset_type !== "native"
    && balance.asset_code === code
    && balance.asset_issuer === issuer
  ));
}

async function ensure(config: AppConfig): Promise<string | null> {
  if (
    config.public.network !== "mainnet"
    || !config.agentSecret
    || !config.public.agentAddress
    || !config.public.asset.issuer
  ) {
    throw new Error("research relay trustline configuration is incomplete");
  }

  const keypair = Keypair.fromSecret(config.agentSecret);
  if (keypair.publicKey() !== config.public.agentAddress) {
    throw new Error("research relay signer does not match its public address");
  }

  const server = new Horizon.Server("https://horizon.stellar.org");
  const load = () => server.loadAccount(config.public.agentAddress!);
  const account = await load();
  if (hasAssetTrustline(account.balances, config.public.asset.code, config.public.asset.issuer)) {
    return null;
  }

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.PUBLIC,
  })
    .addOperation(Operation.changeTrust({
      asset: new Asset(config.public.asset.code, config.public.asset.issuer),
    }))
    .setTimeout(60)
    .build();
  transaction.sign(keypair);

  try {
    const submitted = await server.submitTransaction(transaction);
    if (!/^[0-9a-f]{64}$/i.test(submitted.hash)) {
      throw new Error("Stellar returned an invalid trustline transaction hash");
    }
    return submitted.hash.toLowerCase();
  } catch (error) {
    const refreshed = await load().catch(() => null);
    if (refreshed && hasAssetTrustline(refreshed.balances, config.public.asset.code, config.public.asset.issuer)) {
      return null;
    }
    throw new Error("the research relay could not activate its Circle USDC trustline", { cause: error });
  }
}

/**
 * The relay pays the external x402 seller from its own account. Mainnet USDC
 * therefore needs one classic trustline before the first paid request. The
 * setup is serialized per relay and is never repeated once Horizon confirms it.
 */
export async function ensureAgentUsdcTrustline(config: AppConfig): Promise<string | null> {
  const key = [config.public.network, config.public.agentAddress, config.public.asset.issuer].join(":");
  const existing = runtime.__ackrateTrustlineSetup!.get(key);
  if (existing) return existing;
  const pending = ensure(config).catch((error) => {
    runtime.__ackrateTrustlineSetup!.delete(key);
    throw error;
  });
  runtime.__ackrateTrustlineSetup!.set(key, pending);
  return pending;
}
