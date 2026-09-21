import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";
import { loadAppConfig } from "@/lib/wallet/app-config";
import { boundedJson, jsonError, NO_STORE_HEADERS } from "@/lib/wallet/http";
import {
  authenticationMessage,
  CHALLENGE_TTL_SECONDS,
  challengeCookieName,
  cookieOptions,
  createChallengeToken,
  requireSameOrigin,
} from "@/lib/wallet/security";
import { NextResponse } from "next/server";

const Body = z.object({ address: z.string().refine(StrKey.isValidEd25519PublicKey, "a valid Stellar G-address is required") }).strict();

export async function POST(request: Request) {
  try {
    const origin = await requireSameOrigin();
    const config = loadAppConfig();
    if (!config.sessionSecret) throw new Error("wallet authentication is not configured");
    const { address } = Body.parse(await boundedJson(request, 4_096));
    const now = Math.floor(Date.now() / 1_000);
    const challenge = createChallengeToken(
      address,
      config.public.network,
      origin,
      config.sessionSecret,
      now,
    );
    const response = NextResponse.json({
      ok: true,
      message: authenticationMessage(challenge.payload),
      expiresAt: challenge.payload.exp,
      statement: "Sign this readable message in Freighter. No transaction, spending permission, or fee.",
    }, { headers: NO_STORE_HEADERS });
    response.cookies.set(challengeCookieName(), challenge.token, cookieOptions(CHALLENGE_TTL_SECONDS));
    return response;
  } catch (error) {
    return jsonError(error, 400);
  }
}
