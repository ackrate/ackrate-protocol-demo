import { loadAppConfig } from "../../../../../lib/wallet/app-config";
import { reportRetryStore } from "../../../../../lib/wallet/report-retry";
import { createReportRetryHandlers } from "../../../../../lib/wallet/report-retry-http";
import { requireSameOrigin, requireSession } from "../../../../../lib/wallet/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const handlers = createReportRetryHandlers({
  requireOrigin: requireSameOrigin,
  async authenticate() {
    const config = loadAppConfig();
    if (!config.sessionSecret || !config.public.authenticationReady) throw new Error("Wallet authentication unavailable");
    const session = await requireSession(config.sessionSecret, config.public.network);
    if (!session.address) throw new Error("Wallet session required");
    return session.address;
  },
  modelConfigured: () => Boolean(process.env.OPENAI_API_KEY?.trim()),
  store: reportRetryStore,
});
export const GET = handlers.GET;
export const POST = handlers.POST;
