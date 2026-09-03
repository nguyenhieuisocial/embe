import { describe, expect, it } from "vitest";

import { HOSPITAL_BAG_GROUPS, HOSPITAL_BAG_IDS } from "../src/lib/hospital-bag";

describe("hospital bag defaults", () => {
  it("keeps documents, mother and baby items distinct and bounded", () => {
    expect(HOSPITAL_BAG_GROUPS.map((group) => group.id)).toEqual(["documents", "mother", "baby"]);
    expect(HOSPITAL_BAG_IDS.length).toBe(14);
    expect(new Set(HOSPITAL_BAG_IDS).size).toBe(HOSPITAL_BAG_IDS.length);
  });
});
