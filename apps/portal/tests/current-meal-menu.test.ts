import { describe, expect, it } from "vitest";

import { currentMealType, suggestCurrentMealMenus } from "../src/lib/pregnancy-menu";

describe("current meal menu", () => {
  it("selects the Vietnamese meal slot from the current time", () => {
    expect(currentMealType(new Date("2026-09-04T00:30:00Z"))).toBe("breakfast");
    expect(currentMealType(new Date("2026-09-04T05:30:00Z"))).toBe("lunch");
    expect(currentMealType(new Date("2026-09-04T11:30:00Z"))).toBe("dinner");
    expect(currentMealType(new Date("2026-09-04T15:30:00Z"))).toBe("snack");
  });

  it("replaces a menu that was just recorded and favors a missing food group", () => {
    const recentMenu = "Cơm, bò xào rau củ chín kỹ, thanh long";
    const menus = suggestCurrentMealMenus("lunch", [{
      mealType: "lunch",
      note: recentMenu,
      foods: [{ nameVi: "Bò xào rau củ", foodGroups: ["protein", "vegetables", "starch"] }]
    }], new Date("2026-09-04T05:30:00Z"));

    expect(menus).toHaveLength(3);
    expect(menus).not.toContain(recentMenu);
    expect(menus.some((menu) => /sữa|trái cây/i.test(menu))).toBe(true);
  });

  it("uses today's nutrition before suggesting the next current meal", () => {
    const menus = suggestCurrentMealMenus("dinner", [{
      mealType: "breakfast",
      eatenAt: "2026-09-04T01:00:00Z",
      note: "Cơm trắng",
      foods: [{ nameVi: "Cơm trắng", foodGroups: ["starch"] }],
      nutritionTotals: { protein_g: 8, fiber_g: 1, calcium_mg: 20 }
    }, {
      mealType: "lunch",
      eatenAt: "2026-09-03T05:00:00Z",
      note: "Sữa chua",
      foods: [{ nameVi: "Sữa chua", foodGroups: ["dairy"] }],
      nutritionTotals: { calcium_mg: 350 }
    }], new Date("2026-09-04T11:30:00Z"));

    expect(menus[0]).toMatch(/thêm đạm chín kỹ/i);
  });
});
