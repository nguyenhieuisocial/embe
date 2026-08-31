import { createSessionCookie } from "../src/lib/portal-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const createSignedUploadUrl = vi.fn();
const info = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc, storage: { from: () => ({ createSignedUploadUrl, info }) } })
}));

import { GET as history, POST as createMeal } from "../src/app/api/meals/route";
import { POST as completeMeal } from "../src/app/api/meals/[id]/complete/route";
import { GET as getMeal, PATCH as confirmMeal } from "../src/app/api/meals/[id]/route";

const originalEnvironment = { ...process.env };
const entryId = "11111111-1111-4111-8111-111111111111";
const storagePath = `incoming/2026/09/${entryId}.jpg`;
const rawAnalysis = {
  foods: [{ name_vi: "Cơm trắng", search_name_en: "white rice cooked", estimated_grams: 120,
    confidence: 0.8, food_groups: ["starch"], safety_flags: [] }],
  needs_user_confirmation: ["Khối lượng cơm"],
  estimate_notice: "Ước lượng từ ảnh; cần xác nhận món và khẩu phần trước khi lưu."
};

function cookie(): string { return `embe_session=${createSessionCookie("server-secret")}`; }
function request(url: string, body: unknown, method = "POST", authenticated = true): Request {
  return new Request(url, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", origin: "https://embe.hieu.asia", ...(authenticated ? { cookie: cookie() } : {}) }
  });
}

describe("private review-first meal analysis API", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
    rpc.mockReset(); createSignedUploadUrl.mockReset(); info.mockReset();
  });
  afterEach(() => { process.env = { ...originalEnvironment }; });

  it("requires a portal session and same-origin mutation", async () => {
    const body = { authorRole: "mother", byteSize: 1000, eatenAt: "2026-09-01T05:00:00Z", filename: "meal.jpg",
      idempotencyKey: entryId, mealType: "lunch", mimeType: "image/jpeg", note: "cơm ít" };
    expect((await createMeal(request("https://embe.hieu.asia/api/meals", body, "POST", false))).status).toBe(401);
    const forged = request("https://embe.hieu.asia/api/meals", body); forged.headers.set("origin", "https://evil.example");
    expect((await createMeal(forged)).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts only bounded camera images and creates a private signed destination", async () => {
    rpc.mockResolvedValueOnce({ data: { id: entryId, storage_path: storagePath }, error: null });
    createSignedUploadUrl.mockResolvedValueOnce({ data: { signedUrl: "https://project.supabase.co/signed?token=short" }, error: null });
    const response = await createMeal(request("https://embe.hieu.asia/api/meals", {
      authorRole: "mother", byteSize: 1000, eatenAt: "2026-09-01T05:00:00Z", filename: "meal.jpg",
      idempotencyKey: entryId, mealType: "lunch", mimeType: "image/jpeg", note: "cơm ít"
    }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ entryId, uploadUrl: expect.stringContaining("token=short") });
    expect(createSignedUploadUrl).toHaveBeenCalledWith(storagePath, { upsert: false });

    const invalid = await createMeal(request("https://embe.hieu.asia/api/meals", {
      authorRole: "mother", byteSize: 13_000_000, eatenAt: "bad", filename: "meal.svg",
      idempotencyKey: entryId, mealType: "brunch", mimeType: "image/svg+xml", note: ""
    }));
    expect(invalid.status).toBe(400);
  });

  it("verifies stored bytes before queueing local image analysis", async () => {
    rpc.mockResolvedValueOnce({ data: { id: entryId, storage_path: storagePath, byte_size: 1000, mime_type: "image/jpeg" }, error: null });
    info.mockResolvedValueOnce({ data: { size: 1000, contentType: "image/jpeg" }, error: null });
    rpc.mockResolvedValueOnce({ data: { status: "accepted" }, error: null });
    const response = await completeMeal(request(`https://embe.hieu.asia/api/meals/${entryId}/complete`, {}), { params: Promise.resolve({ id: entryId }) });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "analyzing" });
  });

  it("returns a review draft, then stores only a user-confirmed bounded result", async () => {
    rpc.mockResolvedValueOnce({ data: { id: entryId, status: "review", note: "cơm ít", analysis: rawAnalysis }, error: null });
    const review = await getMeal(request(`https://embe.hieu.asia/api/meals/${entryId}`, undefined, "GET"), { params: Promise.resolve({ id: entryId }) });
    expect(review.status).toBe(200);
    expect((await review.json()).analysis.foods[0].nameVi).toBe("Cơm trắng");

    rpc.mockResolvedValueOnce({ data: { id: entryId, status: "review", analysis: rawAnalysis }, error: null });
    rpc.mockResolvedValueOnce({ data: { id: entryId, status: "nutrition_pending" }, error: null });
    const confirmed = await confirmMeal(request(`https://embe.hieu.asia/api/meals/${entryId}`, {
      note: "cơm ít", analysis: rawAnalysis
    }, "PATCH"), { params: Promise.resolve({ id: entryId }) });
    expect(confirmed.status).toBe(202);
    expect(rpc).toHaveBeenLastCalledWith("embe_confirm_meal_analysis", expect.objectContaining({ p_id: entryId }));
  });

  it("returns the confirmed nutrition result instead of the earlier model draft", async () => {
    rpc.mockResolvedValueOnce({ data: {
      id: entryId, status: "confirmed", note: "cơm ít", analysis: rawAnalysis,
      confirmed_analysis: { ...rawAnalysis, nutrition: {
        status: "estimated", source: "USDA FoodData Central", totals: { calories: 156 },
        calorie_range: { low: 117, mid: 156, high: 195 }, notice: "Ước lượng sau xác nhận."
      } }
    }, error: null });
    const response = await getMeal(request(`https://embe.hieu.asia/api/meals/${entryId}`, undefined, "GET"), { params: Promise.resolve({ id: entryId }) });
    const payload = await response.json();
    expect(payload.analysis.nutrition.calorieRange.mid).toBe(156);
  });

  it("describes trends without treating missing logs as deficiency", async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: entryId, meal_type: "lunch", eaten_at: "2026-09-01T05:00:00Z", note: "", analysis: rawAnalysis }], error: null });
    const response = await history(request("https://embe.hieu.asia/api/meals?days=7", undefined, "GET"));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.suggestions[0]).toContain("Ghi ít nhất 3 bữa");
    expect(payload.notice).toContain("không chẩn đoán thiếu chất");
  });
});
