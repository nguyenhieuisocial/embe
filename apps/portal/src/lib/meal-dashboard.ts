import type { MealAnalysis } from "./meal-analysis-contract";

export type MealHistoryEntry = {
  id: string;
  mealType: string;
  eatenAt: string;
  note: string;
  status?: "ready" | "processing" | "analyzing" | "needs_review" | "failed";
  analysis: MealAnalysis;
};

export const FOOD_GROUP_LABELS: Record<string, string> = {
  vegetables: "Rau", protein: "Đạm", starch: "Tinh bột", fruit: "Trái cây",
  dairy: "Sữa", fat: "Chất béo", other: "Khác"
};

function dayKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function buildMealDashboard(history: MealHistoryEntry[], days: number, now = new Date()) {
  const daily = Array.from({ length: days }, (_, offset) => {
    const date = new Date(now.getTime() - (days - offset - 1) * 86_400_000);
    return { key: dayKey(date), label: new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh", day: "numeric", month: "numeric"
    }).format(date), calories: 0, meals: 0 };
  });
  const byDay = new Map(daily.map((day) => [day.key, day]));
  const groupCounts: Record<string, number> = {};
  const nutrientTotals: Record<string, number> = {};
  let calorieLow = 0;
  let calorieHigh = 0;
  let mealsWithCalories = 0;

  for (const entry of history) {
    const day = byDay.get(dayKey(new Date(entry.eatenAt)));
    if (day) day.meals += 1;
    const range = entry.analysis.nutrition?.calorieRange;
    if (range) {
      calorieLow += range.low;
      calorieHigh += range.high;
      mealsWithCalories += 1;
      if (day) day.calories += range.mid;
    }
    for (const [key, value] of Object.entries(entry.analysis.nutrition?.totals ?? {})) {
      nutrientTotals[key] = (nutrientTotals[key] ?? 0) + value;
    }
    const groups = new Set(entry.analysis.foods.flatMap((food) => food.foodGroups));
    for (const group of groups) groupCounts[group] = (groupCounts[group] ?? 0) + 1;
  }

  return {
    daily, groupCounts, nutrientTotals,
    calorieRange: mealsWithCalories ? { low: calorieLow, high: calorieHigh } : null,
    maxDailyCalories: Math.max(1, ...daily.map((day) => day.calories))
  };
}
