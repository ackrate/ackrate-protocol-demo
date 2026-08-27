import { z } from "zod";
import { requireReadyConfig } from "@/lib/wallet/app-config";
import { boundedJson, jsonError, NO_STORE_HEADERS } from "@/lib/wallet/http";
import { getPendingCatalogRecovery, recoverPendingCatalogPurchase } from "@/lib/wallet/purchase";
import { requireSameOrigin, requireSession } from "@/lib/wallet/security";
import { NextResponse } from "next/server";

const MandateId = z.string().regex(/^[0-9a-f]{64}$/);
const Body = z.object({ mandateId: MandateId }).strict();

async function authenticatedInput(mandateId: string) {
  const config = requireReadyConfig();
  if (!config.sessionSecret) throw new Error("wallet authentication is not configured");
  const session = await requireSession(config.sessionSecret, config.public.network);
  if (!session.address) throw new Error("wallet-authenticated session required");
  return {
    config,
    sessionAddress: session.address,
    sessionId: `${session.address}:${mandateId}`,
    mandateId,
  };
}

export async function GET(request: Request) {
  try {
    const mandateId = MandateId.parse(new URL(request.url).searchParams.get("mandateId"));
    const recovery = await getPendingCatalogRecovery(await authenticatedInput(mandateId));
    return NextResponse.json({ ok: true, recovery }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error, 400);
  }
}

export async function POST(request: Request) {
  try {
    await requireSameOrigin();
    const { mandateId } = Body.parse(await boundedJson(request, 4_096));
    const result = await recoverPendingCatalogPurchase(await authenticatedInput(mandateId));
    return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error, 400);
  }
}
