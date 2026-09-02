import { describe, expect, it } from "vitest";
import { upcomingPregnancyCareWindows } from "../src/lib/pregnancy-care-windows";

describe("Vietnam pregnancy care windows", () => {
  it("returns the next relevant windows with calendar ranges", () => {
    const result = upcomingPregnancyCareWindows("2027-04-01", 14, 3);
    expect(result.map((item) => item.weekLabel)).toEqual(["18–20 tuần", "24–27 tuần", "28–32 tuần"]);
    expect(result[0].dateLabel).toMatch(/^\d{2}\/\d{2}–\d{2}\/\d{2}\/\d{4}$/);
  });

  it("does not present suggested windows as confirmed appointments", () => {
    const result = upcomingPregnancyCareWindows("2027-04-01", 24, 3);
    expect(result.every((item) => item.kind === "suggested_window")).toBe(true);
    expect(result[0].title.toLowerCase()).toContain("khám");
  });
});
