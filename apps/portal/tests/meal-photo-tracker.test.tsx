import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MealPhotoTracker from "../src/components/meal-photo-tracker";

const mealClient = vi.hoisted(() => ({
  createMealDraft: vi.fn(), createMealNote: vi.fn(),
  waitForMealDraft: vi.fn(), waitForMealNutrition: vi.fn()
}));

vi.mock("../src/lib/meal-photo-client", () => ({
  ...mealClient
}));

const history = [{
  id: "11111111-1111-4111-8111-111111111111", mealType: "lunch", eatenAt: "2026-09-01T05:00:00Z", note: "ít cơm",
  status: "processing" as const,
  analysis: {
    foods: [{ nameVi: "Cơm và rau", searchNameEn: "rice vegetables", estimatedGrams: 200,
      confidence: 0.8, foodGroups: ["starch", "vegetables"], safetyFlags: [] }],
    needsUserConfirmation: [], estimateNotice: "Ước lượng",
    nutrition: { status: "estimated", totals: { calories: 260, fiber_g: 4 },
      calorieRange: { low: 210, mid: 260, high: 310 }, notice: "Ước lượng" }
  }
}];

describe("mobile meal journal", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("shows worker availability, charts and full meal details for 7 or 28 days", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      history, suggestions: ["Các bữa đã ghi có rau."], worker: { status: "offline" }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    render(<MealPhotoTracker />);
    expect(await screen.findByText("Máy nhà đang tắt")).toBeInTheDocument();
    const insights = screen.getByText("Nhìn lại dinh dưỡng").closest("details");
    expect(insights).not.toHaveAttribute("open");
    if (insights) fireEvent.click(within(insights).getByText("Nhìn lại dinh dưỡng"));
    expect(insights).toHaveAttribute("open");
    expect(screen.getByText("Năng lượng theo ngày")).toBeInTheDocument();
    expect(screen.getByText("Nhóm thực phẩm xuất hiện")).toBeInTheDocument();
    expect(screen.getByText("Lịch sử từng bữa")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "28 ngày" }));
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith("/api/meals?days=28", { cache: "no-store" }));
    fireEvent.click(screen.getByText("Cơm và rau"));
    expect(screen.getByText("ít cơm")).toBeInTheDocument();
    expect(screen.getByText("Đã lưu · đang bổ sung dinh dưỡng")).toBeInTheDocument();
  });

  it("saves a written meal when no photo is selected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      history: [], suggestions: [], worker: { status: "online" }
    }), { status: 200 })));
    mealClient.createMealNote.mockResolvedValue("11111111-1111-4111-8111-111111111111");

    render(<MealPhotoTracker />);
    fireEvent.change(screen.getByLabelText("Ghi chú món ăn · có thể lưu không cần ảnh"), {
      target: { value: "Một ly sữa và một quả chuối" }
    });
    const save = screen.getByRole("button", { name: "Lưu ghi chú" });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(mealClient.createMealNote).toHaveBeenCalledWith(expect.objectContaining({
      note: "Một ly sữa và một quả chuối", mealType: expect.any(String)
    })));
    expect(await screen.findByText("Đã lưu ghi chú bữa ăn.")).toBeInTheDocument();
  });

  it("lets the mother correct recognition and add a missing food before saving", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("/api/meals/") && init?.method === "PATCH") {
        return new Response(JSON.stringify({ status: "nutrition_pending" }), { status: 202 });
      }
      return new Response(JSON.stringify({ history: [], suggestions: [], worker: { status: "online" } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);
    mealClient.createMealDraft.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    mealClient.waitForMealDraft.mockResolvedValue({
      note: "",
      analysis: {
        foods: [{ nameVi: "Fried rice", searchNameEn: "fried rice", estimatedGrams: 200,
          confidence: 0.65, foodGroups: ["starch"], safetyFlags: [] }],
        needsUserConfirmation: [], estimateNotice: "Ước lượng"
      }
    });
    mealClient.waitForMealNutrition.mockResolvedValue(undefined);

    render(<MealPhotoTracker />);
    const image = new File(["photo"], "meal.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText(/Chụp bữa ăn/), { target: { files: [image] } });
    fireEvent.click(screen.getByRole("button", { name: "Nhận diện bữa ăn" }));

    const detected = await screen.findByDisplayValue("Fried rice");
    fireEvent.change(detected, { target: { value: "Cơm chiên" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm món còn thiếu" }));
    fireEvent.change(screen.getAllByLabelText("Tên món")[1], { target: { value: "Trứng chiên" } });
    fireEvent.change(screen.getAllByLabelText("Khẩu phần (g)")[1], { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu bữa này" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/meals/11111111-1111-4111-8111-111111111111",
      expect.objectContaining({ method: "PATCH" })
    ));
    const patchCall = fetch.mock.calls.find((call) => call[1]?.method === "PATCH");
    const body = JSON.parse(String(patchCall?.[1]?.body));
    expect(body.analysis.foods).toEqual(expect.arrayContaining([
      expect.objectContaining({ nameVi: "Cơm chiên" }),
      expect.objectContaining({ nameVi: "Trứng chiên", estimatedGrams: 60 })
    ]));
  });

  it("lets the mother correct a saved meal without reusing the stale nutrition query", async () => {
    const savedHistory = [{ ...history[0], status: "ready" as const }];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("/api/meals/") && init?.method === "PATCH") {
        return new Response(JSON.stringify({ status: "nutrition_pending" }), { status: 202 });
      }
      return new Response(JSON.stringify({ history: savedHistory, suggestions: [], worker: { status: "online" } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);
    mealClient.waitForMealNutrition.mockResolvedValue(undefined);

    render(<MealPhotoTracker />);
    const summary = await screen.findByText("Cơm và rau");
    fireEvent.click(summary);
    fireEvent.click(screen.getByRole("button", { name: "Sửa bữa này" }));
    fireEvent.change(screen.getByLabelText("Sửa tên món"), { target: { value: "Đậu hũ" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm món vào bữa đã lưu" }));
    fireEvent.change(screen.getAllByLabelText("Sửa tên món")[1], { target: { value: "Rau luộc" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/meals/11111111-1111-4111-8111-111111111111",
      expect.objectContaining({ method: "PATCH" })
    ));
    const patchCall = fetch.mock.calls.find((call) => call[1]?.method === "PATCH");
    const body = JSON.parse(String(patchCall?.[1]?.body));
    expect(body.analysis.foods).toEqual(expect.arrayContaining([
      expect.objectContaining({ nameVi: "Đậu hũ", searchNameEn: "Đậu hũ" }),
      expect.objectContaining({ nameVi: "Rau luộc", searchNameEn: "Rau luộc" })
    ]));
  });

  it("shows a clear retry message when correcting a saved meal fails", async () => {
    const savedHistory = [{ ...history[0], status: "ready" as const }];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => init?.method === "PATCH"
      ? new Response(JSON.stringify({ error: "temporarily_unavailable" }), { status: 503 })
      : new Response(JSON.stringify({ history: savedHistory, suggestions: [], worker: { status: "online" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    render(<MealPhotoTracker />);
    fireEvent.click(await screen.findByText("Cơm và rau"));
    fireEvent.click(screen.getByRole("button", { name: "Sửa bữa này" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    expect(await screen.findByText("Chưa lưu được thay đổi. Hãy thử lại.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeEnabled();
  });

  it("shows a clear retry message when saving a newly recognized meal fails", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => init?.method === "PATCH"
      ? new Response(JSON.stringify({ error: "temporarily_unavailable" }), { status: 503 })
      : new Response(JSON.stringify({ history: [], suggestions: [], worker: { status: "online" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    mealClient.createMealDraft.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    mealClient.waitForMealDraft.mockResolvedValue({ note: "", analysis: history[0].analysis });

    render(<MealPhotoTracker />);
    fireEvent.change(screen.getByLabelText(/Chụp bữa ăn/), {
      target: { files: [new File(["photo"], "meal.jpg", { type: "image/jpeg" })] }
    });
    fireEvent.click(screen.getByRole("button", { name: "Nhận diện bữa ăn" }));
    fireEvent.click(await screen.findByRole("button", { name: "Lưu bữa này" }));

    expect(await screen.findByText("Chưa lưu được bữa ăn. Hãy thử lại.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu bữa này" })).toBeEnabled();
  });

  it("shows a pregnancy safety warning immediately when the corrected name needs it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      history: [], suggestions: [], worker: { status: "online" }
    }), { status: 200 })));
    mealClient.createMealDraft.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    mealClient.waitForMealDraft.mockResolvedValue({ note: "", analysis: history[0].analysis });

    render(<MealPhotoTracker />);
    fireEvent.change(screen.getByLabelText(/Chụp bữa ăn/), {
      target: { files: [new File(["photo"], "meal.jpg", { type: "image/jpeg" })] }
    });
    fireEvent.click(screen.getByRole("button", { name: "Nhận diện bữa ăn" }));
    fireEvent.change(await screen.findByLabelText("Tên món"), { target: { value: "Trứng lòng đào" } });

    expect(screen.getByText(/cần kiểm tra độ chín hoặc tiệt trùng/i)).toBeInTheDocument();
  });

  it("keeps the pregnancy safety warning visible in saved meal history", async () => {
    const riskyHistory = [{
      ...history[0], status: "ready" as const,
      analysis: { ...history[0].analysis, foods: [{
        ...history[0].analysis.foods[0], nameVi: "Trứng lòng đào", safetyFlags: ["raw_or_undercooked"]
      }] }
    }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      history: riskyHistory, suggestions: [], worker: { status: "online" }
    }), { status: 200 })));

    render(<MealPhotoTracker />);
    fireEvent.click(await screen.findByText("Trứng lòng đào"));
    expect(screen.getByText(/cần kiểm tra độ chín hoặc tiệt trùng/i)).toBeInTheDocument();
  });
});
