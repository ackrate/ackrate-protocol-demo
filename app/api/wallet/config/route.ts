import { loadAppConfig } from "@/lib/wallet/app-config";
import { jsonError, NO_STORE_HEADERS } from "@/lib/wallet/http";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, config: loadAppConfig().public }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error, 503);
  }
}
