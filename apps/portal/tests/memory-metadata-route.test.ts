import { createSessionCookie } from "../src/lib/portal-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

import { PATCH } from "../src/app/api/memories/[id]/route";

const originalEnvironment = { ...process.env };
const id = "11111111-1111-4111-8111-111111111111";

function request(body: unknown): Request {
  return new Request(`https://embe.hieu.asia/api/memories/${id}`, {
    method: "PATCH", body: JSON.stringify(body),
    headers: { "content-type": "application/json", origin: "https://embe.hieu.asia", cookie: `embe_session=${createSessionCookie("secret")}` }
  });
}

describe("uploaded memory metadata API", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-key";
    rpc.mockReset();
  });
  afterEach(() => { process.env = { ...originalEnvironment }; });

  it("updates only an imported web upload", async () => {
    rpc.mockResolvedValue({ data: { event_at: "2025-04-30T03:15:00Z", place_city: "Đà Lạt" }, error: null });
    const response = await PATCH(request({
      capturedAt: "2025-04-30T03:15:00Z", locationName: "Đà Lạt", latitude: 11.9404, longitude: 108.4583
    }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("embe_update_uploaded_media_metadata", {
      p_captured_at: "2025-04-30T03:15:00.000Z", p_latitude: 11.9404,
      p_keep_coordinates: false, p_location_name: "Đà Lạt", p_longitude: 108.4583, p_media_item_id: id
    });
  });

  it("rejects incomplete coordinate pairs", async () => {
    const response = await PATCH(request({ capturedAt: "2025-04-30T03:15:00Z", locationName: "", latitude: 11.94, longitude: null }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps existing EXIF coordinates when only the date changes", async () => {
    rpc.mockResolvedValue({ data: { event_at: "2025-05-01T03:15:00Z", place_city: "Đà Lạt" }, error: null });
    const response = await PATCH(request({ capturedAt: "2025-05-01T03:15:00Z", locationName: "Đà Lạt" }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("embe_update_uploaded_media_metadata", expect.objectContaining({
      p_keep_coordinates: true, p_latitude: null, p_longitude: null
    }));
  });
});
