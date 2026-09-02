import { afterEach, describe, expect, it, vi } from "vitest";

import { prepareMealPhoto, uploadMealPhoto } from "../src/lib/meal-photo-client";

describe("meal photo upload reliability", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a transient upload failure before reporting an error", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const file = new File([new Uint8Array([1, 2, 3])], "bua-an.jpg", { type: "image/jpeg" });

    const pending = uploadMealPhoto("https://project.supabase.co/upload", file);
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shrinks an iPhone photo enough for faster local vision without changing its aspect ratio", async () => {
    const originalImage = globalThis.Image;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalCreateElement = document.createElement.bind(document);
    let quality = 0;
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (callback: BlobCallback, _type?: string, requestedQuality?: number) => {
        quality = requestedQuality ?? 0;
        callback(new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }));
      }
    };
    class TestImage {
      naturalWidth = 4032;
      naturalHeight = 3024;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", TestImage);
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) =>
      tagName === "canvas" ? canvas : originalCreateElement(tagName)) as typeof document.createElement);

    const result = await prepareMealPhoto(new File([new Uint8Array([1])], "iphone.heic", { type: "image/heic" }));

    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(960);
    expect(quality).toBe(0.78);
    expect(result.type).toBe("image/jpeg");
    globalThis.Image = originalImage;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });
});
