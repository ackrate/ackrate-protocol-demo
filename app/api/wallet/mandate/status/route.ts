import { z } from "zod";
import { requireReadyConfig } from "@/lib/wallet/app-config";
import { boundedJson, jsonError, NO_STORE_HEADERS } from "@/lib/wallet/http";
import { assertMandateIdentityBindings, readMandate } from "@/lib/wallet/mandate-state";
import { requireSameOrigin, requireSession } from "@/lib/wallet/security";
import { NextResponse } from "next/server";

const Body = z.object({ mandateId: z.string().regex(/^[0-9a-f]{64}$/) }).strict();

export async function POST(request: Request) {
  try {
    await requireSameOrigin();
    const config = requireReadyConfig();
    if (!config.sessionSecret) throw new Error("wallet authentication is not configured");
    const session = await requireSession(config.sessionSecret, config.public.network);
    if (!session.address) throw new Error("wallet-authenticated session required");
    const { mandateId } = Body.parse(await boundedJson(request, 4_096));
    const mandate = await readMandate(config.network, session.address, mandateId);
    if (!config.public.agentAddress || !config.public.merchant.address) {
      throw new Error("wallet payment identities are not configured");
    }
    assertMandateIdentityBindings(mandate, {
      user: session.address,
      agent: config.public.agentAddress,
      merchant: config.public.merchant.address,
      asset: config.public.asset.contractId,
    });
    return NextResponse.json({ ok: true, mandate }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error, 400);
  }
}
