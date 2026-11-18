import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OS Vibes",
    short_name: "OS Vibes",
    description: "A free, open-source music player for independent music.",
    start_url: "/",
    display: "standalone",
    background_color: "#171a20",
    theme_color: "#171a20",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
