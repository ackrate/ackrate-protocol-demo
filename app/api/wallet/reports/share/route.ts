import { NextResponse } from "next/server";
import { z } from "zod";
import { loadAppConfig } from "../../../../../lib/wallet/app-config";
import { boundedJson, NO_STORE_HEADERS } from "../../../../../lib/wallet/http";
import { requireSameOrigin, requireSession } from "../../../../../lib/wallet/security";
import { createSharedReport, SharedReportStoreError } from "../../../../../lib/wallet/shared-report-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const inputSchema = z.object({ mandateId: z.string().regex(/^[0-9a-f]{64}$/i), txHash: z.string().regex(/^[0-9a-f]{64}$/i) }).strict();
const headers = { ...NO_STORE_HEADERS, "X-Content-Type-Options": "nosniff" };

/** An explicit Share action publishes only this wallet's already-completed report. */
export async function POST(request: Request) {
  try { await requireSameOrigin(); }
  catch { return NextResponse.json({ ok: false, error: "Share from the wallet page on this website." }, { status: 403, headers }); }
  try {
    const config = loadAppConfig();
    if (!config.sessionSecret) return NextResponse.json({ ok: false, error: "Sharing is temporarily unavailable." }, { status: 503, headers });
    let owner: string;
    try {
      const session = await requireSession(config.sessionSecret, config.public.network);
      if (!session.address) throw new Error("Wallet session required");
      owner = session.address;
    } catch {
      return NextResponse.json({ ok: false, error: "Reconnect and sign in with the wallet that created this report. You do not need to pay for the service again." }, { status: 401, headers });
    }
    let input;
    try { input = inputSchema.parse(await boundedJson(request, 4096)); }
    catch { return NextResponse.json({ ok: false, error: "The saved report reference is invalid." }, { status: 400, headers }); }
    const report = await createSharedReport({ owner, mandateId: input.mandateId.toLowerCase(), txHash: input.txHash.toLowerCase() });
    return NextResponse.json({ ok: true, id: report.id, path: `/reports/${report.id}` }, { status: 201, headers });
  } catch (cause) {
    if (cause instanceof SharedReportStoreError && cause.code === "not_found") {
      return NextResponse.json({ ok: false, error: "This wallet has no completed report matching that receipt." }, { status: 404, headers });
    }
    return NextResponse.json({ ok: false, error: "The report link could not be saved. Your result is still available; try Share again without rerunning the service." }, { status: 503, headers });
  }
}
