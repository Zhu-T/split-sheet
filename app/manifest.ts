import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Split",
    short_name: "Split",
    description: "Split shared expenses with friends.",
    start_url: "/",
    display: "standalone",
    background_color: "#141412", // dark is the default theme
    theme_color: "#1f6f5c",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
