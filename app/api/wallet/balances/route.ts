import { StrKey } from "@stellar/stellar-sdk";
import { NextRequest, NextResponse } from "next/server";
import { jsonError, NO_STORE_HEADERS } from "@/lib/wallet/http";

export const dynamic = "force-dynamic";

const HORIZON_MAINNET = "https://horizon.stellar.org";
const CIRCLE_USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

type HorizonBalance = {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
};

type HorizonAccount = {
  account_id: string;
  balances: HorizonBalance[];
};

function displayAmount(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Horizon returned an invalid wallet balance");
  return parsed.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 7 });
}

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address")?.trim() ?? "";
    if (!StrKey.isValidEd25519PublicKey(address)) {
      return NextResponse.json({ ok: false, error: "Connect a valid Stellar account" }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const response = await fetch(`${HORIZON_MAINNET}/accounts/${encodeURIComponent(address)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (response.status === 404) {
      return NextResponse.json({ ok: false, error: "This Stellar Mainnet account is not funded" }, { status: 404, headers: NO_STORE_HEADERS });
    }
    if (!response.ok) throw new Error(`Stellar balance service returned HTTP ${response.status}`);

    const account = await response.json() as HorizonAccount;
    if (account.account_id !== address || !Array.isArray(account.balances)) {
      throw new Error("Stellar returned an invalid account response");
    }

    const native = account.balances.find((balance) => balance.asset_type === "native");
    const usdc = account.balances.find((balance) => (
      balance.asset_code === "USDC" && balance.asset_issuer === CIRCLE_USDC_ISSUER
    ));

    return NextResponse.json({
      ok: true,
      balances: {
        address,
        xlm: displayAmount(native?.balance ?? "0"),
        usdc: displayAmount(usdc?.balance ?? "0"),
      },
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error, 502);
  }
}
