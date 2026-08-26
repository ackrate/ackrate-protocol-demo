import { z } from "zod";
import { loadAppConfig } from "@/lib/wallet/app-config";
import { loadAccountSequence } from "@/lib/wallet/horizon-account";
import { boundedJson, jsonError, NO_STORE_HEADERS } from "@/lib/wallet/http";
import { requireSameOrigin, requireSession } from "@/lib/wallet/security";
import { NextResponse } from "next/server";

const Body = z.object({ address: z.string() }).strict();

export async function POST(request: Request) {
  try {
    await requireSameOrigin();
    const config = loadAppConfig();
    if (!config.sessionSecret) throw new Error("wallet authentication is not configured");
    const session = await requireSession(config.sessionSecret, config.public.network);
    const { address } = Body.parse(await boundedJson(request, 4_096));
    if (address !== session.address) throw new Error("account does not match the authenticated wallet");
    const sequence = await loadAccountSequence(address, config.public.network, false);
    return NextResponse.json({ ok: true, sequence }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error, 400);
  }
}
