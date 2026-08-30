import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Em Bé — Nhật ký gia đình",
    short_name: "Em Bé",
    description: "Không gian riêng của gia đình Mẹ Ngân, Ba Hiếu và em bé.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f2e9",
    theme_color: "#173f49",
    lang: "vi",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      }
    ]
  };
}
