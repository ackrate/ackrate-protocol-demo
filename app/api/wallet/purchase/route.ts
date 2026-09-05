import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireReadyConfig } from "@/lib/wallet/app-config";
import { boundedJson, jsonError, NO_STORE_HEADERS } from "@/lib/wallet/http";
import { purchaseCatalogItem } from "@/lib/wallet/purchase";
import { requireSameOrigin, requireSession } from "@/lib/wallet/security";
import { NextResponse } from "next/server";

const Body = z.object({
  mandateId: z.string().regex(/^[0-9a-f]{64}$/),
  sourceId: z.string().min(1).max(48),
  question: z.string().trim().min(3).max(400).optional(),
  parameters: z.record(z.string().min(1).max(64), z.union([
    z.string().max(4_000),
    z.number().finite(),
    z.boolean(),
    z.array(z.string().max(2_000)).max(20),
  ])).optional(),
}).strict();

export async function POST(request: Request) {
  try {
    await requireSameOrigin();
    const config = requireReadyConfig();
    if (!config.sessionSecret) throw new Error("wallet authentication is not configured");
    const session = await requireSession(config.sessionSecret, config.public.network);
    if (!session.address) throw new Error("wallet-authenticated session required");
    const { mandateId, sourceId, question, parameters } = Body.parse(await boundedJson(request, 32_768));
    const result = await purchaseCatalogItem({
      config,
      sessionAddress: session.address,
      sessionId: `${session.address}:${mandateId}`,
      toolCallId: `direct:${randomUUID()}`,
      mandateId,
      sourceId,
      question,
      parameters,
    });
    return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error, 400);
  }
}
