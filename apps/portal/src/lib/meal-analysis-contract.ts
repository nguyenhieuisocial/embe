export const MEAL_BUCKET = "embe-meal-inbox";
export const MEAL_MAX_BYTES = 12_000_000;
export const MEAL_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"]);
export const FOOD_GROUPS = new Set(["starch", "protein", "vegetables", "fruit", "dairy", "fat", "other"]);
export const SAFETY_FLAGS = new Set([
  "raw_or_undercooked", "unpasteurized", "high_mercury_possible", "alcohol", "unknown"
]);

export type MealFood = {
  nameVi: string;
  searchNameEn: string;
  estimatedGrams: number | null;
  confidence: number;
  foodGroups: string[];
  safetyFlags: string[];
};

export type MealAnalysis = {
  entryMode?: "note";
  foods: MealFood[];
  needsUserConfirmation: string[];
  estimateNotice: string;
  nutrition?: {
    status: "estimated" | "unavailable";
    source?: string;
    totals?: Record<string, number>;
    calorieRange?: { low: number; mid: number; high: number } | null;
    notice: string;
  };
};

function text(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= maximum
    ? value.trim() : null;
}

export function normalizeMealAnalysis(value: unknown): MealAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const entryMode = raw.entry_mode ?? raw.entryMode;
  if (entryMode !== undefined && entryMode !== "note") return null;
  if (!Array.isArray(raw.foods) || raw.foods.length > 8 || (entryMode !== "note" && raw.foods.length < 1)) return null;
  const foods: MealFood[] = [];
  for (const candidate of raw.foods) {
    if (!candidate || typeof candidate !== "object") return null;
    const food = candidate as Record<string, unknown>;
    const nameVi = text(food.name_vi ?? food.nameVi, 80);
    const searchNameEn = text(food.search_name_en ?? food.searchNameEn, 100);
    const grams = Object.hasOwn(food, "estimated_grams") ? food.estimated_grams : food.estimatedGrams;
    const confidence = food.confidence;
    const groups = food.food_groups ?? food.foodGroups;
    const flags = food.safety_flags ?? food.safetyFlags;
    if (
      !nameVi || !searchNameEn
      || (grams !== null && (typeof grams !== "number" || !Number.isFinite(grams) || grams < 1 || grams > 3000))
      || typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1
      || !Array.isArray(groups) || groups.length < 1 || groups.length > 4
      || groups.some((group) => typeof group !== "string" || !FOOD_GROUPS.has(group))
      || !Array.isArray(flags) || flags.length > 4
      || flags.some((flag) => typeof flag !== "string" || !SAFETY_FLAGS.has(flag))
    ) return null;
    foods.push({
      nameVi, searchNameEn, estimatedGrams: grams as number | null, confidence,
      foodGroups: [...new Set(groups as string[])], safetyFlags: [...new Set(flags as string[])]
    });
  }
  const questions = raw.needs_user_confirmation ?? raw.needsUserConfirmation;
  const notice = raw.estimate_notice ?? raw.estimateNotice;
  if (!Array.isArray(questions) || questions.length > 6
      || questions.some((question) => !text(question, 120)) || !text(notice, 180)) return null;
  let nutrition: MealAnalysis["nutrition"];
  if (raw.nutrition && typeof raw.nutrition === "object") {
    const value = raw.nutrition as Record<string, unknown>;
    const status = value.status;
    const noticeText = text(value.notice, 240);
    const source = value.source === undefined ? undefined : text(value.source, 100);
    const totals = value.totals && typeof value.totals === "object"
      ? Object.fromEntries(Object.entries(value.totals as Record<string, unknown>)
          .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0))
      : undefined;
    const range = value.calorie_range ?? value.calorieRange;
    const calorieRange = range === null ? null : range && typeof range === "object"
      && ["low", "mid", "high"].every((key) => typeof (range as Record<string, unknown>)[key] === "number")
      ? range as { low: number; mid: number; high: number } : undefined;
    if ((status === "estimated" || status === "unavailable") && noticeText && (source !== null)) {
      nutrition = { status, ...(source ? { source } : {}), ...(totals ? { totals } : {}),
        ...(calorieRange !== undefined ? { calorieRange } : {}), notice: noticeText };
    }
  }
  return {
    ...(entryMode === "note" ? { entryMode } : {}),
    foods,
    needsUserConfirmation: questions.map((question) => String(question).trim()),
    estimateNotice: String(notice).trim(),
    ...(nutrition ? { nutrition } : {})
  };
}

export function databaseMealAnalysis(value: MealAnalysis): Record<string, unknown> {
  return {
    ...(value.entryMode === "note" ? { entry_mode: "note" } : {}),
    foods: value.foods.map((food) => ({
      name_vi: food.nameVi, search_name_en: food.searchNameEn,
      estimated_grams: food.estimatedGrams, confidence: food.confidence,
      food_groups: food.foodGroups, safety_flags: food.safetyFlags
    })),
    needs_user_confirmation: value.needsUserConfirmation,
    estimate_notice: value.estimateNotice
  };
}
