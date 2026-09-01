import { describe, expect, it } from "vitest";

import { buildFamilyHealthFhirBundle } from "../src/lib/family-health-fhir";

describe("FHIR R4 family health export", () => {
  it("exports maternal weight and blood pressure as coded observations", () => {
    const bundle = buildFamilyHealthFhirBundle({
      dueDate: "2027-04-15",
      health: [{
        day: "2026-09-01", weightKg: 52.5, systolic: 112, diastolic: 72,
        sleepMinutes: 450, waterGlasses: 8, movementMinutes: 25, wellbeing: 4,
        checklistPercent: 80
      }],
      records: [], plans: [], unavailable: []
    }, new Date("2026-09-01T10:00:00Z"));

    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("collection");
    expect(bundle.timestamp).toBe("2026-09-01T10:00:00.000Z");
    expect(bundle.entry).toEqual(expect.arrayContaining([
      expect.objectContaining({ resource: expect.objectContaining({
        resourceType: "Observation",
        code: expect.objectContaining({ coding: [expect.objectContaining({ code: "29463-7" })] }),
        valueQuantity: expect.objectContaining({ value: 52.5, unit: "kg" })
      }) }),
      expect.objectContaining({ resource: expect.objectContaining({
        resourceType: "Observation",
        code: expect.objectContaining({ coding: [expect.objectContaining({ code: "85354-9" })] }),
        component: expect.arrayContaining([
          expect.objectContaining({ code: expect.objectContaining({ coding: [expect.objectContaining({ code: "8480-6" })] }) }),
          expect.objectContaining({ code: expect.objectContaining({ coding: [expect.objectContaining({ code: "8462-4" })] }) })
        ])
      }) })
    ]));
  });

  it("exports baby growth without inventing percentiles or diagnoses", () => {
    const bundle = buildFamilyHealthFhirBundle({
      dueDate: null, health: [], records: [], plans: [], unavailable: [],
      lifecycle: { birthOccurredAt: "2027-03-20T08:00:00Z", babySex: "female" },
      growth: [{
        id: "11111111-1111-4111-8111-111111111111", measured_at: "2027-04-20T08:00:00Z",
        weight_g: 4100, length_cm: 54.2, head_cm: 37
      }]
    }, new Date("2027-04-21T00:00:00Z"));

    const text = JSON.stringify(bundle);
    expect(text).toContain('"code":"29463-7"');
    expect(text).toContain('"code":"8302-2"');
    expect(text).toContain('"code":"9843-4"');
    expect(text).toContain('"gender":"female"');
    expect(text).not.toMatch(/percentile|diagnosis|z-score/i);
    expect(text).not.toContain("Mẹ Ngân");
    expect(text).not.toContain("Ba Hiếu");
  });

  it("drops invalid measurements instead of exporting malformed clinical data", () => {
    const bundle = buildFamilyHealthFhirBundle({
      dueDate: null,
      health: [{ day: "not-a-day", weightKg: -1, systolic: null, diastolic: null, sleepMinutes: null,
        waterGlasses: null, movementMinutes: null, wellbeing: null, checklistPercent: 0 }],
      records: [], plans: [], unavailable: []
    });
    expect(bundle.entry).toEqual([]);
  });
});
