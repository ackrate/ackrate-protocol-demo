import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReadyConfig } from "@/lib/wallet/app-config";
import { assertSuccessfulDelivery } from "@/lib/wallet/delivery-result";
import { getMarketplaceRun, getToolCall } from "@/lib/wallet/journal";
import { NO_STORE_HEADERS } from "@/lib/wallet/http";
import { requireSession } from "@/lib/wallet/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({ mandateId: z.string().regex(/^[0-9a-f]{64}$/), requestId: z.string().uuid() }).strict();
const headers = { ...NO_STORE_HEADERS, "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Poll one explicit Run only. This route never signs, pays, retries delivery, or writes state. */
export async function GET(request: Request) {
  let authenticated = false;
  try {
    const config = requireReadyConfig();
    if (!config.sessionSecret) throw new Error("wallet authentication unavailable");
    const session = await requireSession(config.sessionSecret, config.public.network);
    if (!session.address) throw new Error("wallet session required");
    authenticated = true;
    const parameters = new URL(request.url).searchParams;
    if ([...parameters.keys()].length !== 2) return NextResponse.json({ ok: false, error: "Supply one mandateId and requestId." }, { status: 400, headers });
    const parsed = Query.safeParse(Object.fromEntries(parameters));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "A valid mandateId and requestId are required." }, { status: 400, headers });
    const { mandateId, requestId } = parsed.data;
    const record = await getToolCall({ sessionId: `${session.address}:${mandateId}`, toolCallId: `configured:${requestId}`, mandateId });
    const base = { ok: true, requestId, mandateId, reserved: Boolean(record), sourceId: record?.sourceId };
    if (!record) return NextResponse.json({ ...base, stage: "starting", message: "Waiting for this request to start. No payment has been confirmed." }, { headers });
    const item = config.public.catalog.find((entry) => entry.id === record.sourceId);
    if (!item || !record.requestHash || !/^[0-9a-f]{64}$/.test(record.requestHash)) {
      return NextResponse.json({ ...base, stage: "review_required", message: "This request's saved scope needs review. No new payment was sent." }, { headers });
    }
    const saved = object(record.result);
    const payment = object(saved?.payment);
    const txHash = typeof saved?.txHash === "string" && /^[0-9a-f]{64}$/i.test(saved.txHash) ? saved.txHash : undefined;
    if (record.status === "succeeded") {
      const source = object(saved?.source);
      if (!saved || source?.id !== record.sourceId || payment?.mandateId !== mandateId || payment?.status !== "settled"
        || typeof payment.txHash !== "string" || !/^[0-9a-f]{64}$/i.test(payment.txHash)
        || payment.amount !== item.price || payment.asset !== config.public.asset.code) {
        return NextResponse.json({ ...base, stage: "review_required", message: "The saved result does not match this request's payment scope." }, { headers });
      }
      try {
        assertSuccessfulDelivery(saved.delivered, { sourceId: record.sourceId, txHash: payment.txHash, mandateId,
          price: item.price, assetCode: config.public.asset.code, assetContract: config.public.asset.contractId });
      } catch {
        return NextResponse.json({ ...base, stage: "review_required", txHash: payment.txHash, message: "The saved payment or service output requires review." }, { headers });
      }
      return NextResponse.json({ ...base, stage: "complete", txHash: payment.txHash, result: record.result }, { headers });
    }
    if (record.status === "failed") return NextResponse.json({ ...base, stage: "failed", message: "This request stopped before a completed result was saved. No replacement purchase will start automatically." }, { headers });
    if (record.status === "delivery_pending") return NextResponse.json({ ...base, stage: "review_required", txHash, message: "This request has retained payment evidence but no completed delivery. Keep its receipt; no replacement payment will be sent." }, { headers });
    if (record.status !== "running") return NextResponse.json({ ...base, stage: "review_required", message: "This request has an unrecognized saved state." }, { headers });
    if (!txHash) return NextResponse.json({ ...base, stage: "starting", message: "Preparing this request and checking the service. No payment has been confirmed." }, { headers });
    if (saved?.mandateId !== mandateId || saved?.sourceId !== record.sourceId) return NextResponse.json({ ...base, stage: "review_required", message: "The retained payment does not match this request." }, { headers });
    const marketplace = await getMarketplaceRun(txHash, { readOnly: true });
    if (marketplace && (marketplace.contractTx !== txHash || marketplace.mandateId !== mandateId)) {
      return NextResponse.json({ ...base, stage: "review_required", txHash, message: "The marketplace record does not match this request." }, { headers });
    }
    if (marketplace?.status === "review_required") return NextResponse.json({ ...base, stage: "review_required", txHash, message: "The marketplace response needs review. No replacement payment will be sent." }, { headers });
    if (marketplace?.status === "marketplace_paid" || marketplace?.status === "complete") {
      const evidence = object(marketplace.evidence);
      const delivery = object(evidence?.delivery);
      const formatting = record.sourceId === "agent402-research"
        && Array.isArray(evidence?.results) && typeof evidence?.query === "string"
        && (!delivery || delivery.state === "received");
      return NextResponse.json({ ...base, stage: formatting ? "formatting" : "fetching_service", txHash,
        message: formatting ? "The marketplace response is saved. Preparing the formatted result." : "The marketplace payment is recorded. Receiving the service output." }, { headers });
    }
    if (marketplace?.status === "payment_pending") return NextResponse.json({ ...base, stage: "fetching_service", txHash, message: "The protected service request has reached the marketplace." }, { headers });
    return NextResponse.json({ ...base, stage: "checking_payment", txHash, message: "A payment transaction is recorded. Waiting for verification; settlement is not yet confirmed here." }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: authenticated ? "Request status is temporarily unavailable. Polling does not send a payment." : "Connect and verify your wallet to read this request." }, { status: authenticated ? 503 : 401, headers });
  }
}
