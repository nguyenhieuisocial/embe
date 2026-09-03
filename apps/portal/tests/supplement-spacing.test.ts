import { describe, expect, it } from "vitest";

import { supplementTimingConflicts } from "../src/lib/supplement-spacing";

describe("supplementTimingConflicts", () => {
  it("finds active iron and calcium plans scheduled at the same time", () => {
    expect(supplementTimingConflicts([
      { id: "iron", active: true, reminder_times: ["08:00"], nutrient_amounts: { iron_mg: 27 } },
      { id: "calcium", active: true, reminder_times: ["08:00", "20:00"], nutrient_amounts: { calcium_mg: 500 } }
    ])).toEqual([{ ironPlanId: "iron", calciumPlanId: "calcium", time: "08:00" }]);
  });

  it("ignores paused plans and different reminder times", () => {
    expect(supplementTimingConflicts([
      { id: "iron", active: true, reminder_times: ["08:00"], nutrient_amounts: { iron_mg: 27 } },
      { id: "calcium", active: false, reminder_times: ["08:00"], nutrient_amounts: { calcium_mg: 500 } },
      { id: "later", active: true, reminder_times: ["12:00"], nutrient_amounts: { calcium_mg: 500 } }
    ])).toEqual([]);
  });
});
