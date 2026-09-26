import { z } from "zod";
import { loadAppConfig } from "@/lib/wallet/app-config";
import { boundedJson, jsonError, NO_STORE_HEADERS } from "@/lib/wallet/http";
import { consumeChallenge } from "@/lib/wallet/journal";
import {
  SESSION_TTL_SECONDS,
  challengeCookieName,
  cookieOptions,
  createSessionToken,
  openToken,
  requireSameOrigin,
  sessionCookieName,
  verifySignedChallengeMessage,
} from "@/lib/wallet/security";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const Body = z.object({ signature: z.string().length(88) }).strict();

export async function POST(request: Request) {
  try {
    const origin = await requireSameOrigin();
    const config = loadAppConfig();
    if (!config.public.authenticationReady || !config.sessionSecret) throw new Error("wallet authentication is not configured");
    const jar = await cookies();
    const challenge = openToken(
      jar.get(challengeCookieName())?.value,
      config.sessionSecret,
      "challenge",
    );
    if (!challenge || challenge.authentication !== "sep53" || challenge.network !== config.public.network) {
      throw new Error("authentication challenge is missing, invalid, or expired");
    }
    const { signature } = Body.parse(await boundedJson(request, 4096));
    verifySignedChallengeMessage(signature, challenge, origin);
    if (!(await consumeChallenge(challenge.jti, challenge.exp))) {
      throw new Error("authentication challenge was already consumed");
    }
    const session = createSessionToken(challenge.address, challenge.network, config.sessionSecret);
    const response = NextResponse.json({
      ok: true,
      session: {
        authenticated: true,
        address: challenge.address,
        network: challenge.network,
        expiresAt: session.payload.exp,
      },
    }, { headers: NO_STORE_HEADERS });
    response.cookies.set(sessionCookieName(), session.token, cookieOptions(SESSION_TTL_SECONDS));
    response.cookies.set(challengeCookieName(), "", cookieOptions(0));
    return response;
  } catch (error) {
    return jsonError(error, 401);
  }
}
