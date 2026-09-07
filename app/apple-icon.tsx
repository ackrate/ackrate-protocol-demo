import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        background: "#000",
        display: "flex",
        height: "100%",
        position: "relative",
        width: "100%",
      }}
    >
      <div style={{ background: "#ff1800", borderRadius: 999, filter: "blur(18px)", height: 112, left: 34, opacity: 0.52, position: "absolute", top: 34, width: 112 }} />
      <div style={{ background: "radial-gradient(circle at 38% 34%, #ffd2b8 0 8%, #ff5a1f 28%, #ff1000 62%, #660000 100%)", borderRadius: 999, boxShadow: "0 0 0 3px #ff3b21, 0 0 34px #ff1800", height: 92, left: 44, position: "absolute", top: 44, width: 92 }} />
      <div style={{ border: "3px solid #ff2a12", borderRadius: "50%", height: 46, left: 21, position: "absolute", top: 67, transform: "rotate(-22deg)", width: 138 }} />
    </div>,
    size,
  );
}
