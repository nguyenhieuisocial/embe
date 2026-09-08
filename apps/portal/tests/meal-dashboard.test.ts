import { describe, expect, it } from "vitest";

import { buildMealDashboard, type MealHistoryEntry } from "../src/lib/meal-dashboard";

const entry: MealHistoryEntry = {
  id: "11111111-1111-4111-8111-111111111111", mealType: "lunch",
  eatenAt: "2026-09-01T05:00:00Z", note: "",
  analysis: {
    foods: [{ nameVi: "Cơm và rau", searchNameEn: "rice vegetables", estimatedGrams: 200,
      confidence: 0.8, foodGroups: ["starch", "vegetables"], safetyFlags: [] }],
    needsUserConfirmation: [], estimateNotice: "Ước lượng",
    nutrition: { status: "estimated", totals: { calories: 260, fiber_g: 4 },
      calorieRange: { low: 210, mid: 260, high: 310 }, notice: "Ước lượng" }
  }
};

describe("meal dashboard", () => {
  it("excludes invalid, future and out-of-window dates from every aggregate", () => {
    const rows = [entry, ...["invalid", "2026-08-01T05:00:00Z", "2026-09-01T16:00:00Z"]
      .map(eatenAt => ({ ...entry, eatenAt }))];
    const result = buildMealDashboard(rows, 7, new Date("2026-09-01T15:00:00Z"));
    expect(result.calorieRange).toEqual({ low: 210, high: 310 });
    expect(result.nutrientTotals.fiber_g).toBe(4);
    expect(result.groupCounts.vegetables).toBe(1);
    expect(result.daily.reduce((sum, day) => sum + day.meals, 0)).toBe(1);
  });
  it("uses Vietnam midnight for today's totals, not the UTC date", () => {
    const result = buildMealDashboard([
      { ...entry, eatenAt: "2026-09-01T16:59:59Z" },
      { ...entry, eatenAt: "2026-09-01T17:00:00Z" }
    ], 1, new Date("2026-09-01T18:00:00Z"));
    expect(result.daily[0]).toMatchObject({ key: "2026-09-02", meals: 1 });
    expect(result.nutrientTotals.fiber_g).toBe(4);
  });
  it("groups confirmed meals by Vietnam date without inventing daily targets", () => {
    const result = buildMealDashboard([entry], 7, new Date("2026-09-01T15:00:00Z"));
    expect(result.daily.at(-1)).toMatchObject({ key: "2026-09-01", meals: 1, calories: 260 });
    expect(result.calorieRange).toEqual({ low: 210, high: 310 });
    expect(result.groupCounts).toEqual({ starch: 1, vegetables: 1 });
    expect(result.nutrientTotals.fiber_g).toBe(4);
  });
});
