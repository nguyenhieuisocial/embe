import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadMealPhoto } from "../src/lib/meal-photo-client";

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
});
