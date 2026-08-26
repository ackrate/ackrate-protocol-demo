import { loadAppConfig } from "@/lib/wallet/app-config";
import { jsonError, NO_STORE_HEADERS } from "@/lib/wallet/http";
import { verifyPostgres } from "@/lib/wallet/postgres";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const app = loadAppConfig();
    const config = app.public;
    if (app.databaseUrl) await verifyPostgres(app.databaseUrl);
    return NextResponse.json({
      ok: config.ready,
      releaseState: config.releaseState,
      network: config.network,
      sourceCommit: config.sourceCommit,
      releaseFingerprint: config.releaseFingerprint,
      durableState: config.durableState,
      database: app.databaseUrl ? "connected" : "not-configured",
      blockers: config.blockers,
    }, { status: config.ready ? 200 : 503, headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error, 503);
  }
}
