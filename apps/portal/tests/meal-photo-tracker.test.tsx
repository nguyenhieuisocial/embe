import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByText("Năng lượng theo ngày")).toBeInTheDocument();
    expect(screen.getByText("Nhóm thực phẩm xuất hiện")).toBeInTheDocument();
    expect(screen.getByText("Lịch sử từng bữa")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "28 ngày" }));
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith("/api/meals?days=28", { cache: "no-store" }));
    fireEvent.click(screen.getByText("Cơm và rau"));
    expect(screen.getByText("ít cơm")).toBeInTheDocument();
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
});
