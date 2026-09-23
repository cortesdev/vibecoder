import { ImageResponse } from "next/og";

// 1200×630 OG image: free-first headline, terminal-green accent, dark shell
// matching the site. Rendered at request time; no binary asset to maintain.
export const alt = "Vibecoder — the free, open source AI coding agent";
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
          justifyContent: "space-between",
          padding: "72px",
          background: "linear-gradient(135deg, #0d0d0f 0%, #16161a 100%)",
          color: "#f5f5f7",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#30d158",
              display: "flex",
            }}
          />
          <div style={{ fontSize: 34, fontWeight: 700 }}>vibecoder</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              display: "flex",
            }}
          >
            The free AI coding agent.
          </div>
          <div style={{ fontSize: 34, color: "#a1a1a6", display: "flex" }}>
            Open source · Your keys · Your machine
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              padding: "14px 28px",
              borderRadius: 12,
              background: "#30d158",
              color: "#0d0d0f",
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            Free download
          </div>
          <div style={{ fontSize: 28, color: "#a1a1a6", display: "flex" }}>
            macOS · Windows · Linux
          </div>
        </div>
      </div>
    ),
    size
  );
}
