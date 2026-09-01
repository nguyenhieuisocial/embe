import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "share");
    Reflect.deleteProperty(navigator, "canShare");
  });

  it("loads the next private page without replacing visible memories", async () => {
    const initial = Array.from({ length: 24 }, (_, index) => memory(index));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      memories: [memory(24)],
      hasMore: false
    }), { status: 200, headers: { "content-type": "application/json" } }));

    render(<MemoryGrid date="2026-08-30" initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Xem thêm kỷ niệm" }));

    await waitFor(() => expect(screen.getByAltText("Kỷ niệm 24")).toBeInTheDocument());
    expect(screen.getByAltText("Kỷ niệm 0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xem thêm kỷ niệm" })).not.toBeInTheDocument();
  });

  it("links each day album to the matching day detail", () => {
    render(<MemoryGrid initial={[memory(1)]} />);

    expect(screen.getByRole("link", { name: /Mở album Chủ Nhật, 30 tháng 8, 2026/i }))
      .toHaveAttribute("href", "/ky-niem?view=ngay-thang&date=2026-08-30");
  });

  it("switches between chronology and journeys without a page reload", () => {
    render(<MemoryGrid initial={[memory(1), memory(2)]} initialView="ngay-thang" />);

    fireEvent.click(screen.getByRole("button", { name: "Chuyến đi" }));

    expect(screen.getByRole("heading", { name: "Đà Lạt · tháng 8 năm 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chuyến đi" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows every trip photo as an openable full-width journey frame", () => {
    render(<MemoryGrid initial={[memory(1), memory(2), memory(3)]} initialView="chuyen-di" />);

    expect(screen.getByRole("region", { name: "Ảnh trong chuyến Đà Lạt · tháng 8 năm 2026" }))
      .toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Mở ảnh Kỷ niệm/ })).toHaveLength(3);
    expect(screen.getByText("Vuốt để xem từng ảnh")).toBeInTheDocument();
  });

  it("shows one full-width day album instead of a two-column photo feed", () => {
    render(<MemoryGrid initial={[memory(1), memory(2)]} initialView="ngay-thang" />);

    expect(screen.getByRole("link", { name: /Mở album Chủ Nhật, 30 tháng 8, 2026/i }))
      .toHaveAttribute("href", "/ky-niem?view=ngay-thang&date=2026-08-30");
    expect(screen.getByText("2 ảnh")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mở ảnh Kỷ niệm/ })).not.toBeInTheDocument();
  });

  it("opens one day as an album grid with a path back to all days", () => {
    render(<MemoryGrid date="2026-08-30" initial={[memory(1), memory(2)]} initialView="ngay-thang" />);

    expect(screen.getByRole("link", { name: "Tất cả ngày" }))
      .toHaveAttribute("href", "/ky-niem?view=ngay-thang");
    expect(screen.getAllByRole("button", { name: /Mở ảnh Kỷ niệm/ })).toHaveLength(2);
  });

  it("traps viewer focus and restores it to the photo that opened it", () => {
    render(<MemoryGrid album="da-lat-2025" initial={[memory(1), memory(2)]} initialView="album" />);

    const opener = screen.getByRole("button", { name: "Mở ảnh Kỷ niệm 1" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Kỷ niệm 1" });
    const close = screen.getByRole("button", { name: "Đóng ảnh" });
    expect(close).toHaveFocus();

    screen.getByRole("button", { name: "Phóng to ảnh" }).focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Lưu ảnh về máy" })).toHaveFocus();

    fireEvent.click(close);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("opens a dedicated print page for the current private photo", () => {
    render(<MemoryGrid album="da-lat-2025" initial={[memory(1), memory(2)]} initialView="album" />);

    fireEvent.click(screen.getByRole("button", { name: "Mở ảnh Kỷ niệm 1" }));
    expect(screen.getByText("Vuốt ngang · chụm để phóng to")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "In ảnh này" }))
      .toHaveAttribute("href", "/in-anh/00000001-1111-4111-8111-111111111111");
  });

  it("offers native file sharing and a temporary friend link from the photo viewer", () => {
    render(<MemoryGrid album="da-lat-2025" initial={[memory(1)]} initialView="album" />);
    fireEvent.click(screen.getByRole("button", { name: "Mở ảnh Kỷ niệm 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Chia sẻ ảnh" }));

    expect(screen.getByRole("button", { name: "Gửi ảnh" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi link xem 7 ngày" })).toBeInTheDocument();
  });

  it("saves the original photo through the native iPhone sheet", async () => {
    const share = vi.fn(async (_data: ShareData): Promise<void> => undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200, headers: { "content-type": "image/webp" }
    }));
    render(<MemoryGrid album="da-lat-2025" initial={[memory(1)]} initialView="album" />);
    fireEvent.click(screen.getByRole("button", { name: "Mở ảnh Kỷ niệm 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu ảnh về máy" }));

    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    const data = share.mock.calls[0][0] as ShareData;
    expect(data.files?.[0]).toBeInstanceOf(File);
    expect(data.files?.[0].type).toBe("image/webp");
  });

  it("zooms in and out with visible controls", () => {
    render(<MemoryGrid album="da-lat-2025" initial={[memory(1)]} initialView="album" />);
    fireEvent.click(screen.getByRole("button", { name: "Mở ảnh Kỷ niệm 1" }));
    const image = within(screen.getByRole("dialog", { name: "Kỷ niệm 1" })).getByAltText("Kỷ niệm 1");

    fireEvent.click(screen.getByRole("button", { name: "Phóng to ảnh" }));
    expect(image).toHaveStyle({ transform: "translate3d(0px, 0px, 0) scale(1.5)" });
    expect(screen.getByRole("button", { name: "Đặt ảnh về kích thước ban đầu" })).toHaveTextContent("150%");

    fireEvent.click(screen.getByRole("button", { name: "Thu nhỏ ảnh" }));
    expect(image).toHaveStyle({ transform: "translate3d(0px, 0px, 0) scale(1)" });
  });

  it("toggles touch-friendly quick zoom by double tapping the image", () => {
    render(<MemoryGrid album="da-lat-2025" initial={[memory(1)]} initialView="album" />);
    fireEvent.click(screen.getByRole("button", { name: "Mở ảnh Kỷ niệm 1" }));
    const image = within(screen.getByRole("dialog", { name: "Kỷ niệm 1" })).getByAltText("Kỷ niệm 1");

    fireEvent.doubleClick(image);
    expect(image).toHaveStyle({ transform: "translate3d(0px, 0px, 0) scale(2)" });
    fireEvent.doubleClick(image);
    expect(image).toHaveStyle({ transform: "translate3d(0px, 0px, 0) scale(1)" });
  });
});
