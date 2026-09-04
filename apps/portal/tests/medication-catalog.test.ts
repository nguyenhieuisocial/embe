import { describe, expect, it } from "vitest";

import { searchMedicationCatalog } from "../src/lib/medication-catalog";

describe("medication catalog search", () => {
  it("finds Vietnamese names without requiring accents", () => {
    expect(searchMedicationCatalog("sat", 3).map((item) => item.name)).toContain("Sắt");
  });

  it("finds a medicine by its international alias and keeps the correct category", () => {
    expect(searchMedicationCatalog("acetaminophen", 3)[0]).toMatchObject({
      name: "Paracetamol",
      category: "medicine",
      detail: "Hoạt chất · còn gọi là acetaminophen"
    });
  });

  it("ranks an exact brand prefix before a loose alias match", () => {
    expect(searchMedicationCatalog("elev", 3)[0]).toMatchObject({
      name: "Elevit Pronatal",
      category: "supplement"
    });
  });
});
