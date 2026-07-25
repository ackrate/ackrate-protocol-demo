import type { MetadataRoute } from "next";

const BASE_URL = "https://reapp.live";
// Build time, not a pinned date: a constant silently goes stale for every
// page changed after it, which is worse than no signal.
const LAST_MODIFIED = new Date();

const routes = [
  "",
  "/ap2",
  "/cli",
  "/composites",
  "/consumer",
  "/express",
  "/solutions",
  "/research",
  "/t2",
  "/t2/demo",
  "/video",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: LAST_MODIFIED,
  }));
}
