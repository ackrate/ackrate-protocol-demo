import { ImageResponse } from "next/og";

export const alt = "ACKRATE — agentic payments, bounded by code";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "90px",
          background: "#0a0e0d",
          backgroundImage: "radial-gradient(900px 520px at 50% -10%, #14372b, #0a0e0d 62%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              width: 104,
              height: 104,
              borderRadius: 26,
              display: "flex",
              position: "relative",
              background: "linear-gradient(145deg, #34d399, #10b981)",
            }}
          >
            <div style={{ background: "#06241a", borderRadius: 4, height: 43, left: 44, position: "absolute", top: 19, width: 17 }} />
            <div style={{ background: "#06241a", borderRadius: 4, height: 16, left: 24, position: "absolute", top: 48, width: 56 }} />
            <div style={{ background: "#06241a", borderRadius: 4, height: 24, left: 24, position: "absolute", top: 61, width: 16 }} />
            <div style={{ background: "#06241a", borderRadius: 4, height: 24, left: 64, position: "absolute", top: 61, width: 16 }} />
          </div>
          <div
            style={{
              fontSize: 104,
              fontWeight: 800,
              letterSpacing: -2,
              backgroundImage: "linear-gradient(90deg, #d1fae5, #5eead4)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            ACKRATE
          </div>
        </div>
        <div style={{ marginTop: 46, fontSize: 48, fontWeight: 700, color: "#eef2ff" }}>
          Agentic payments, bounded by code.
        </div>
        <div style={{ marginTop: 20, fontSize: 28, color: "#9aa6c0" }}>
          Live testnet · MandateRegistry · TypeScript SDK
        </div>
      </div>
    ),
    { ...size },
  );
}
