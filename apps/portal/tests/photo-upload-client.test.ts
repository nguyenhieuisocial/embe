import { afterEach, describe, expect, it, vi } from "vitest";

import { sendFamilyPhoto } from "../src/lib/photo-upload-client";

describe("camera-first upload client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates, uploads directly, then confirms without sending bytes through Vercel", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ uploadId: "11111111-1111-4111-8111-111111111111", uploadUrl: "https://storage.example/signed" }), { status: 201 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "accepted" }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "IMG_1.JPG", { type: "image/jpeg", lastModified: Date.parse("2026-09-01T01:00:00Z") });

    await expect(sendFamilyPhoto({ authorRole: "mother", caption: "Chào ba", file, idempotencyKey: "11111111-1111-4111-8111-111111111111" })).resolves.toEqual({ uploadId: "11111111-1111-4111-8111-111111111111" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/photo-uploads");
    expect(fetchMock.mock.calls[1][0]).toBe("https://storage.example/signed");
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: "PUT", body: expect.any(FormData) }));
    expect(fetchMock.mock.calls[2][0]).toBe("/api/photo-uploads/11111111-1111-4111-8111-111111111111/complete");
  });

  it("stops before completion when direct storage rejects the file", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ uploadId: "11111111-1111-4111-8111-111111111111", uploadUrl: "https://storage.example/signed" }), { status: 201 }))
      .mockResolvedValueOnce(new Response("", { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["photo"], "photo.jpg", { type: "image/jpeg" });

    await expect(sendFamilyPhoto({ authorRole: "father", caption: "", file, idempotencyKey: "11111111-1111-4111-8111-111111111111" })).rejects.toThrow("upload_failed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
