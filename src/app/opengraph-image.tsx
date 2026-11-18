import { ImageResponse } from "next/og";

export const alt = "OS Vibes: a free, open-source music player for independent music";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#8daaf0";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#171a20",
        backgroundImage: "radial-gradient(rgba(228,229,231,0.13) 1.5px, transparent 1.5px)",
        backgroundSize: "28px 28px",
        color: "#e9eaec",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[0, 1].map((row) => (
            <div key={row} style={{ display: "flex", gap: 4 }}>
              {[0, 1].map((column) => (
                <div
                  key={column}
                  style={{
                    width: 17,
                    height: 17,
                    borderRadius: 5,
                    background: ACCENT,
                    opacity: row + column === 0 ? 0.58 : row + column === 2 ? 1 : 0.78,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 40, letterSpacing: -1.5, fontWeight: 600 }}>OS Vibes</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 22, letterSpacing: 3, color: "#9a9ca3", marginBottom: 24 }}>
          {"MUSIC WORKSPACE · FREE & OPEN SOURCE"}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            fontSize: 88,
            lineHeight: 1,
            letterSpacing: -4,
          }}
        >
          <span>Sound from the open web,&nbsp;</span>
          <span style={{ color: ACCENT }}>no gatekeepers.</span>
        </div>
      </div>
    </div>,
    size,
  );
}
