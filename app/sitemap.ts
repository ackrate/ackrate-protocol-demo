import type { MetadataRoute } from "next";

const BASE_URL = "https://staging.ackrate.com";
const LAST_MODIFIED = new Date("2026-07-18T00:00:00Z");

const routes = [
  "",
  "/ap2",
  "/cli",
  "/composites",
  "/consumer",
  "/express",
  "/merchants",
  "/solutions",
  "/research",
  "/security",
  "/toolkit",
  "/toolkit/cli",
  "/video",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: LAST_MODIFIED,
  }));
}
