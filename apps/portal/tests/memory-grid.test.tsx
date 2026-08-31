import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MemoryGrid from "../src/components/memory-grid";
import type { MediaMemory } from "../src/lib/media";

function memory(index: number): MediaMemory {
  return {
    id: `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
    eventAt: "2026-08-30T10:00:00Z",
    title: `Kỷ niệm ${index}`,
    caption: "Gia đình bên nhau",
    mimeType: "image/webp",
    width: 1200,
    height: 900,
    placeCity: "Đà Lạt",
    placeRegion: "Lâm Đồng",
    placeCountry: "Việt Nam",
    albumKey: "da-lat-2025",
    albumTitle: "Đà Lạt · 23.12.2025",
    albumOrder: 50,
    reactions: {}
  };
}

describe("mobile memory grid", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads the next private page without replacing visible memories", async () => {
    const initial = Array.from({ length: 24 }, (_, index) => memory(index));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      memories: [memory(24)],
      hasMore: false
    }), { status: 200, headers: { "content-type": "application/json" } }));

    render(<MemoryGrid initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Xem thêm kỷ niệm" }));

    await waitFor(() => expect(screen.getByAltText("Kỷ niệm 24")).toBeInTheDocument());
    expect(screen.getByAltText("Kỷ niệm 0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xem thêm kỷ niệm" })).not.toBeInTheDocument();
  });

  it("links every memory date back to the matching calendar day", () => {
    render(<MemoryGrid initial={[memory(1)]} />);

    expect(screen.getByRole("link", { name: /30 thg 8, 2026/ }))
      .toHaveAttribute("href", "/lich?month=2026-08&date=2026-08-30#date-2026-08-30");
  });

  it("switches between chronology and journeys without a page reload", () => {
    render(<MemoryGrid initial={[memory(1), memory(2)]} initialView="ngay-thang" />);

    fireEvent.click(screen.getByRole("button", { name: "Chuyến đi" }));

    expect(screen.getByRole("heading", { name: "Đà Lạt · tháng 8 năm 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chuyến đi" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens an album photo in a full-screen one-hand viewer", () => {
    render(<MemoryGrid album="da-lat-2025" initial={[memory(1), memory(2)]} initialView="album" />);

    fireEvent.click(screen.getByRole("button", { name: "Mở ảnh Kỷ niệm 1" }));
    expect(screen.getByRole("dialog", { name: "Kỷ niệm 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đóng ảnh" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đóng ảnh" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
