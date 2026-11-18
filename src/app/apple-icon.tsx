import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const PANES = [{ opacity: 0.58 }, { opacity: 0.78 }, { opacity: 0.78 }, { opacity: 1 }];

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#171a20",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[PANES.slice(0, 2), PANES.slice(2)].map((row, rowIndex) => (
          <div key={rowIndex} style={{ display: "flex", gap: 12 }}>
            {row.map((pane, paneIndex) => (
              <div
                key={paneIndex}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: "#8daaf0",
                  opacity: pane.opacity,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
