import { z } from "zod";
import type { NetworkName } from "./types";

const HorizonAccount = z.object({
  account_id: z.string(),
  sequence: z.string().regex(/^\d+$/),
});

const HORIZON_ORIGINS: Record<NetworkName, string> = {
  mainnet: "https://horizon.stellar.org",
  testnet: "https://horizon-testnet.stellar.org",
};

export async function loadAccountSequence(address: string, network: NetworkName): Promise<string> {
  const response = await fetch(`${HORIZON_ORIGINS[network]}/accounts/${encodeURIComponent(address)}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) throw new Error(`Stellar ${network} account is not funded`);
  if (!response.ok) throw new Error(`Stellar account service returned HTTP ${response.status}`);

  const account = HorizonAccount.parse(await response.json());
  if (account.account_id !== address) throw new Error("Stellar returned a different account");
  return account.sequence;
}
