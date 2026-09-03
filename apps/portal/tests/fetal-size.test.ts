import { describe, expect, it } from "vitest";

import { fetalSizeForWeek } from "../src/lib/fetal-size";

describe("weekly fetal size", () => {
  it("returns a Vietnamese comparison and approximate length for a supported week", () => {
    expect(fetalSizeForWeek(20)).toMatchObject({
      week: 20,
      comparison: "một quả chuối",
      lengthCm: 25.6
    });
  });

  it("clamps early and late values to the published pregnancy guide", () => {
    expect(fetalSizeForWeek(2)?.week).toBe(4);
    expect(fetalSizeForWeek(44)?.week).toBe(40);
  });

  it("rejects invalid week values", () => {
    expect(fetalSizeForWeek(Number.NaN)).toBeNull();
  });
});
