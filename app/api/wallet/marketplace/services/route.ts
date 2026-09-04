import { NextRequest, NextResponse } from "next/server";
import { loadAppConfig } from "@/lib/wallet/app-config";
import { boundedResponseJson, jsonError, NO_STORE_HEADERS } from "@/lib/wallet/http";
import {
  FALLBACK_MARKETPLACE_SERVICES,
  parseMarketplacePricing,
  searchMarketplaceServices,
  type MarketplaceService,
} from "@/lib/wallet/marketplace-catalog";
import { requireSession } from "@/lib/wallet/security";

export const dynamic = "force-dynamic";

const AGENT402_PRICING_URL = "https://agent402.tools/api/pricing";
const CACHE_MS = 5 * 60 * 1_000;

type CatalogCache = { services: MarketplaceService[]; fetchedAt: number };
const memory = globalThis as typeof globalThis & { __ackrateMarketplaceCatalog?: CatalogCache };

async function liveCatalog(): Promise<CatalogCache> {
  const cached = memory.__ackrateMarketplaceCatalog;
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached;

  const response = await fetch(AGENT402_PRICING_URL, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Agent402 catalog returned HTTP ${response.status}`);
  const services = parseMarketplacePricing(await boundedResponseJson(response, 2 * 1024 * 1024));
  const next = { services, fetchedAt: Date.now() };
  memory.__ackrateMarketplaceCatalog = next;
  return next;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const config = loadAppConfig();
    await requireSession(config.sessionSecret ?? "", config.public.network);
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (query.length > 80) throw new Error("marketplace search must be 80 characters or fewer");

    let catalog = FALLBACK_MARKETPLACE_SERVICES;
    let source: "live" | "verified-fallback" = "verified-fallback";
    try {
      catalog = (await liveCatalog()).services;
      source = "live";
    } catch {
      // The verified fallback keeps the workflow usable during a short catalog outage.
    }

    const result = searchMarketplaceServices(catalog, query);
    return NextResponse.json({
      ok: true,
      marketplace: "Agent402",
      network: "stellar:pubnet",
      source,
      catalogSize: catalog.length,
      totalMatches: result.totalMatches,
      services: result.services,
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error, 400);
  }
}
