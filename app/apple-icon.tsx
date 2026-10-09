import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#1f6f5c" }}>
        <svg viewBox="0 0 64 64" width="180" height="180">
          <path d="M20 44 44 20" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
          <circle cx="22" cy="22" r="6" fill="#fff" />
          <circle cx="42" cy="42" r="6" fill="#fff" />
        </svg>
      </div>
    ),
    size,
  );
}
