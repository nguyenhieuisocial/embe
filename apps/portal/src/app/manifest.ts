import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EmBe — Sổ gia đình",
    short_name: "EmBe",
    description: "Không gian riêng của gia đình Mẹ Ngân, Ba Hiếu và em bé.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f2e9",
    theme_color: "#173f49",
    lang: "vi",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      }
    ]
  };
}
