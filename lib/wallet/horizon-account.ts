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

export async function loadAccountSequence(address: string, network: NetworkName, useBrowserRelay = true): Promise<string> {
  const browser = useBrowserRelay && typeof window !== "undefined";
  const response = await fetch(browser
    ? "/api/wallet/account/sequence"
    : `${HORIZON_ORIGINS[network]}/accounts/${encodeURIComponent(address)}`, browser ? {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ address }),
  } : {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) throw new Error(`Stellar ${network} account is not funded`);
  if (!response.ok) throw new Error(`Stellar account service returned HTTP ${response.status}`);

  const raw: unknown = await response.json();
  if (browser) return z.object({ ok: z.literal(true), sequence: z.string().regex(/^\d+$/) }).parse(raw).sequence;
  const account = HorizonAccount.parse(raw);
  if (account.account_id !== address) throw new Error("Stellar returned a different account");
  return account.sequence;
}
