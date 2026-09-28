import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/wallet", "/reports/"],
    },
    sitemap: "https://reapp.ackrate.com/sitemap.xml",
    host: "https://reapp.ackrate.com",
  };
}
