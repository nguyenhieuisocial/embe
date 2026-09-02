import { describe, expect, it } from "vitest";

import { normalizeMealAnalysis } from "../src/lib/meal-analysis-contract";

describe("meal analysis contract", () => {
  it("keeps a recognized food when the model cannot estimate its portion", () => {
    const result = normalizeMealAnalysis({
      foods: [{
        name_vi: "Phở bò", search_name_en: "beef pho", estimated_grams: null,
        confidence: 0.85, food_groups: ["vegetables", "protein"], safety_flags: []
      }],
      needs_user_confirmation: ["Khẩu phần khoảng bao nhiêu?"],
      estimate_notice: "Ước lượng từ ảnh; cần xác nhận món và khẩu phần trước khi lưu."
    });

    expect(result?.foods[0]).toMatchObject({ nameVi: "Phở bò", estimatedGrams: null });
  });

  it("rejects note-only mode when a payload also contains recognized foods", () => {
    expect(normalizeMealAnalysis({
      entry_mode: "note",
      foods: [{
        name_vi: "Chuối", search_name_en: "banana", estimated_grams: 100,
        confidence: 0.9, food_groups: ["fruit"], safety_flags: []
      }],
      needs_user_confirmation: [], estimate_notice: "Ước lượng"
    })).toBeNull();
  });
});
