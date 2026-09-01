import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MealPhotoTracker from "../src/components/meal-photo-tracker";

vi.mock("../src/lib/meal-photo-client", () => ({
  createMealDraft: vi.fn(), waitForMealDraft: vi.fn(), waitForMealNutrition: vi.fn()
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
  afterEach(() => vi.unstubAllGlobals());

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
});
