import { ImageResponse } from "next/og";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export default function AppleIcon() {
  return new ImageResponse(<div style={{ background: "#fff", color: "#171717", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", fontSize: 120, fontWeight: 800 }}>R<span style={{ color: "#c82b20" }}>.</span></div>, size);
}
