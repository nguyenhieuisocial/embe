import { createSessionCookie } from "../src/lib/portal-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const createSignedUploadUrl = vi.fn();
const info = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc,
    storage: { from: () => ({ createSignedUploadUrl, info }) }
  })
}));

import { POST as createUpload } from "../src/app/api/photo-uploads/route";
import { POST as completeUpload } from "../src/app/api/photo-uploads/[id]/complete/route";

const originalEnvironment = { ...process.env };
const uploadId = "11111111-1111-4111-8111-111111111111";
const path = `incoming/2026/09/${uploadId}.jpg`;

function request(url: string, body: unknown, authenticated = true): Request {
  const cookie = authenticated ? createSessionCookie("server-secret") : undefined;
  return new Request(url, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin: "https://embe.hieu.asia",
      ...(cookie ? { cookie: `embe_session=${cookie}` } : {})
    },
    method: "POST"
  });
}

describe("private camera upload API", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
    rpc.mockReset();
    createSignedUploadUrl.mockReset();
    info.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it("rejects unauthenticated and cross-origin upload creation", async () => {
    const body = {
      authorRole: "mother", byteSize: 1024, caption: "Chào ba",
      capturedAt: "2026-09-01T01:00:00.000Z", filename: "IMG_1.JPG",
      idempotencyKey: uploadId, mimeType: "image/jpeg"
    };
    expect((await createUpload(request("https://embe.hieu.asia/api/photo-uploads", body, false))).status).toBe(401);
    const forged = request("https://embe.hieu.asia/api/photo-uploads", body);
    forged.headers.set("origin", "https://evil.example");
    expect((await createUpload(forged)).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("validates the camera file contract before creating storage state", async () => {
    const response = await createUpload(request("https://embe.hieu.asia/api/photo-uploads", {
      authorRole: "mother", byteSize: 30_000_000, caption: "", capturedAt: "bad",
      filename: "payload.svg", idempotencyKey: uploadId, mimeType: "image/svg+xml"
    }));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns only a short-lived signed destination and opaque upload id", async () => {
    rpc.mockResolvedValueOnce({ data: { id: uploadId, status: "awaiting_upload", storage_path: path }, error: null });
    createSignedUploadUrl.mockResolvedValueOnce({
      data: { path, token: "short-token", signedUrl: `https://project.supabase.co/storage/v1/object/upload/sign/embe-photo-inbox/${path}?token=short-token` },
      error: null
    });
    const response = await createUpload(request("https://embe.hieu.asia/api/photo-uploads", {
      authorRole: "mother", byteSize: 2_000_000, caption: "Chào ba",
      capturedAt: "2026-09-01T01:00:00.000Z", filename: "IMG_1.JPG",
      idempotencyKey: uploadId, mimeType: "image/jpeg",
      latitude: 10.7769, longitude: 106.7009, locationName: "Sài Gòn"
    }));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toEqual({ uploadId, uploadUrl: expect.stringContaining("token=short-token") });
    expect(JSON.stringify(payload)).not.toContain("server-only-key");
    expect(createSignedUploadUrl).toHaveBeenCalledWith(path, { upsert: false });
    expect(rpc).toHaveBeenCalledWith("embe_create_photo_upload", expect.objectContaining({
      p_latitude: 10.7769, p_longitude: 106.7009, p_location_name: "Sài Gòn"
    }));
  });

  it("accepts a short iPhone video through the same private media inbox", async () => {
    const videoPath = `incoming/2026/09/${uploadId}.mov`;
    rpc.mockResolvedValueOnce({ data: { id: uploadId, status: "awaiting_upload", storage_path: videoPath }, error: null });
    createSignedUploadUrl.mockResolvedValueOnce({
      data: { path: videoPath, token: "short-token", signedUrl: `https://project.supabase.co/storage/v1/object/upload/sign/embe-photo-inbox/${videoPath}?token=short-token` },
      error: null
    });
    const response = await createUpload(request("https://embe.hieu.asia/api/photo-uploads", {
      authorRole: "mother", byteSize: 8_000_000, caption: "Video từ Trợ lý",
      capturedAt: "2026-09-01T01:00:00.000Z", filename: "IMG_1.MOV",
      idempotencyKey: uploadId, mimeType: "video/quicktime"
    }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ uploadId, uploadUrl: expect.stringContaining("token=short-token") });
  });

  it("verifies the stored object before accepting completion", async () => {
    rpc.mockResolvedValueOnce({ data: { storage_path: path, byte_size: 2048, mime_type: "image/jpeg", status: "awaiting_upload" }, error: null });
    info.mockResolvedValueOnce({ data: { size: 2048, contentType: "image/jpeg" }, error: null });
    rpc.mockResolvedValueOnce({ data: { status: "accepted" }, error: null });

    const response = await completeUpload(request(`https://embe.hieu.asia/api/photo-uploads/${uploadId}/complete`, {}), { params: Promise.resolve({ id: uploadId }) });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "accepted" });
    expect(rpc).toHaveBeenCalledWith("embe_complete_photo_upload", { p_upload_id: uploadId });
  });

  it("fails closed when uploaded bytes do not match the declared request", async () => {
    rpc.mockResolvedValueOnce({ data: { storage_path: path, byte_size: 2048, mime_type: "image/jpeg", status: "awaiting_upload" }, error: null });
    info.mockResolvedValueOnce({ data: { size: 1024, contentType: "image/jpeg" }, error: null });
    const response = await completeUpload(request(`https://embe.hieu.asia/api/photo-uploads/${uploadId}/complete`, {}), { params: Promise.resolve({ id: uploadId }) });
    expect(response.status).toBe(409);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("embe_get_photo_upload", { p_upload_id: uploadId });
  });
});
