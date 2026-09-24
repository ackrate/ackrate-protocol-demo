import { ImageResponse } from "next/og";
export const alt = "REAPP — Agent payments on Stellar, powered by ACKRATE SDK";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function OpengraphImage() {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 90, background: "#fff", color: "#171717", fontFamily: "sans-serif" }}>
    <div style={{ display: "flex", fontSize: 28 }}>REAPP<span style={{ color: "#c82b20" }}>.</span></div>
    <div style={{ marginTop: 50, fontSize: 76, letterSpacing: -4 }}>Agent payments. Your limits.</div>
    <div style={{ marginTop: 30, fontSize: 28, color: "#555" }}>Stellar Mainnet · Powered by ACKRATE SDK</div>
  </div>, size);
}
