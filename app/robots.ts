import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/wallet"],
    },
    sitemap: "https://staging.ackrate.com/sitemap.xml",
    host: "https://staging.ackrate.com",
  };
}
