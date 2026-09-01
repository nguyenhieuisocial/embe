import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/media", () => ({ getMediaAlbums: vi.fn(async () => []), getMediaMemories: vi.fn(async () => []) }));

import MemoriesPage, { MemoryGallery, MemoryLoading } from "../src/app/ky-niem/page";
import { getMediaAlbums, getMediaMemories } from "../src/lib/media";

describe("family memories", () => {
  beforeEach(() => {
    vi.mocked(getMediaAlbums).mockReset().mockResolvedValue([]);
    vi.mocked(getMediaMemories).mockReset().mockResolvedValue([]);
  });

  it("returns the mobile album shell before waiting for approved media", () => {
    expect(MemoriesPage({ searchParams: Promise.resolve({}) } as never)).toBeInstanceOf(Promise);
  });

  it("shows a useful private empty state before parents approve photos", async () => {
    render(await MemoryGallery());
    expect(screen.getByRole("heading", { name: "Chưa có ảnh được chọn" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem cách đưa ảnh từ iPhone" })).toHaveAttribute("href", "/huong-dan#iphone-title");
  });

  it("shows the date empty state even when other albums exist", async () => {
    vi.mocked(getMediaAlbums).mockResolvedValue([{ key: "gia-dinh", title: "Gia đình", count: 3, covers: [] }]);

    render(await MemoryGallery({ date: "2026-08-31", view: "ngay-thang" }));

    expect(screen.getByRole("heading", { name: "Ngày này chưa có kỷ niệm" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Trở lại lịch gia đình" })).toHaveAttribute("href", "/lich");
  });

  it("contains a gallery failure and offers retry without failing the whole page", async () => {
    vi.mocked(getMediaAlbums).mockRejectedValue(new Error("media unavailable"));

    render(await MemoryGallery());

    expect(screen.getByRole("alert")).toHaveTextContent("Chưa mở được album");
    expect(screen.getByRole("link", { name: "Thử mở lại album" })).toHaveAttribute("href", "/ky-niem");
  });

  it("reserves gallery space with visible skeleton blocks while loading", () => {
    const { container } = render(<MemoryLoading />);

    expect(container.querySelector(".skeleton-line.is-block")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
});
