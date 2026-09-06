import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReadyConfig } from "@/lib/wallet/app-config";
import { preflightAgent402Tool } from "@/lib/wallet/agent402";
import { supportedAgent402ToolForSource } from "@/lib/wallet/agent402-tools";
import { issueMarketplaceQuote } from "@/lib/wallet/marketplace-quote";
import { boundedJson, jsonError, NO_STORE_HEADERS } from "@/lib/wallet/http";
import { requireSameOrigin, requireSession } from "@/lib/wallet/security";

const Body = z.object({ sourceId: z.string().min(1).max(48), parameters: z.record(z.string(), z.unknown()) }).strict();

export async function POST(request: Request) {
  try {
    await requireSameOrigin();
    const config = requireReadyConfig();
    if (!config.sessionSecret) throw new Error("Wallet authentication is not configured");
    const session = await requireSession(config.sessionSecret, config.public.network);
    if (!session.address) throw new Error("Wallet-authenticated session required");
    const { sourceId, parameters } = Body.parse(await boundedJson(request, 32_768));
    const tool = supportedAgent402ToolForSource(sourceId);
    if (!tool) throw new Error("This service is not enabled for protected payments");
    // Discovery + unpaid HTTP 402 only. This endpoint never signs or submits.
    const preflight = await preflightAgent402Tool(tool, parameters, config.public.asset.contractId);
    const quote = issueMarketplaceQuote({ config, user: session.address, sourceId,
      parameters: preflight.input, payTo: preflight.requirement.payTo });
    return NextResponse.json({ ok: true, quote }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
