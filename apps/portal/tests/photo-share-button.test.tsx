import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PhotoShareButton from "../src/components/photo-share-button";
import type { MediaMemory } from "../src/lib/media";

const memory: MediaMemory = {
  id: "11111111-1111-4111-8111-111111111111", eventAt: "2026-09-01T00:00:00Z",
  title: "Ngày vui", caption: "Bên nhau", mimeType: "image/webp", width: 1200, height: 900,
  placeCity: null, placeRegion: null, placeCountry: null, albumKey: "gia-dinh", albumTitle: "Gia đình", albumOrder: 1, reactions: {}
};

describe("photo sharing on mobile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "share");
    Reflect.deleteProperty(navigator, "canShare");
  });

  it("sends the real image file to the native iPhone share sheet", async () => {
    const share = vi.fn(async (_data: ShareData): Promise<void> => undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200, headers: { "content-type": "image/webp" }
    }));
    render(<PhotoShareButton memory={memory} />);
    fireEvent.click(screen.getByRole("button", { name: "Chia sẻ ảnh" }));
    fireEvent.click(screen.getByRole("button", { name: "Gửi ảnh" }));

    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    const data = share.mock.calls[0][0] as ShareData;
    expect(data.files?.[0]).toBeInstanceOf(File);
    expect(data.files?.[0].type).toBe("image/webp");
  });

  it("shares a same-site temporary viewer URL without exposing storage", async () => {
    const share = vi.fn(async (_data: ShareData): Promise<void> => undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ path: "/chia-se/signed.token" }, { status: 201 }));
    render(<PhotoShareButton memory={memory} />);
    fireEvent.click(screen.getByRole("button", { name: "Chia sẻ ảnh" }));
    fireEvent.click(screen.getByRole("button", { name: "Gửi link xem 7 ngày" }));

    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({
      url: "http://localhost:3000/chia-se/signed.token"
    })));
  });
});
