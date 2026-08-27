import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ACKRATE — Give AI a job. Keep the final say.",
    short_name: "ACKRATE",
    description: "Give an AI agent a useful job without giving it open-ended access.",
    start_url: "/",
    display: "standalone",
    background_color: "#04070a",
    theme_color: "#34d399",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
