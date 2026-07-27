import type { MetadataRoute } from "next";

const BASE_URL = "https://reapp.live";
const LAST_MODIFIED = new Date("2026-07-18T00:00:00Z");

const routes = [
  "",
  "/ap2",
  "/cli",
  "/composites",
  "/consumer",
  "/express",
  "/solutions",
  "/research",
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
