import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ACKRATE — Agentic Payments SDK",
    short_name: "ACKRATE",
    description: "Live agentic payments SDK documentation and Stellar testnet demonstrations.",
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
