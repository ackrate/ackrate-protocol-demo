import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/wallet"],
    },
    sitemap: "https://reapp.live/sitemap.xml",
    host: "https://reapp.live",
  };
}
