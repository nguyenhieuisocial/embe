import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EmBe — Sổ gia đình",
    short_name: "EmBe",
    description: "Không gian riêng của gia đình Mẹ Ngân, Ba Hiếu và em bé.",
    id: "/",
    scope: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#FFF7FA",
    theme_color: "#96405F",
    lang: "vi",
    orientation: "portrait-primary",
    shortcuts: [
      {
        name: "Ghi lại",
        short_name: "Ghi lại",
        description: "Ghi nhanh sức khỏe, bữa ăn hoặc một khoảnh khắc.",
        url: "/ghi-lai",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }]
      },
      {
        name: "Kế hoạch",
        short_name: "Kế hoạch",
        description: "Mở việc cần làm và lịch gia đình.",
        url: "/ke-hoach",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }]
      },
      {
        name: "Kỷ niệm",
        short_name: "Kỷ niệm",
        description: "Xem ảnh và dòng thời gian của gia đình.",
        url: "/ky-niem",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }]
      }
    ],
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
