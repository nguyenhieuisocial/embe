import { describe, expect, it } from "vitest";

import { ageOnDate, nextBirthday, parentBirthSummary, validBirthDate } from "../src/lib/family-profile";

describe("family parent profile", () => {
  it("validates real private birth dates", () => {
    expect(validBirthDate("1995-04-12")).toBe("1995-04-12");
    expect(validBirthDate("2035-01-01")).toBeUndefined();
    expect(validBirthDate("not-a-date")).toBeUndefined();
    expect(validBirthDate(null)).toBeNull();
  });

  it("calculates age and the next birthday without UTC date shifts", () => {
    expect(ageOnDate("1995-09-02", new Date(2026, 8, 1))).toBe(30);
    expect(ageOnDate("1995-09-02", new Date(2026, 8, 2))).toBe(31);
    expect(nextBirthday("1995-09-02", new Date(2026, 8, 3))?.getFullYear()).toBe(2027);
    expect(parentBirthSummary("1995-09-02", new Date(2026, 8, 1))).toMatch(/30 tuổi.*Âm lịch.*02\/09\/2026/);
  });
});
