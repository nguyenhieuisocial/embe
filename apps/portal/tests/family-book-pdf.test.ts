import { describe, expect, it } from "vitest";

import { buildFamilyBookDocument } from "../src/lib/family-book-pdf";

describe("family book PDF document", () => {
  it("keeps the family, health, baby, medicine, and safety sections", () => {
    const document = buildFamilyBookDocument({
      days: 28,
      generatedAt: "01 tháng 9, 2026 lúc 10:00",
      week: 8,
      data: {
        dueDate: "2027-04-15",
        unavailable: [],
        health: [{ day: "2026-09-01", weightKg: 52.5, systolic: 112, diastolic: 72, sleepMinutes: 450, waterGlasses: 8, movementMinutes: 25, wellbeing: 4, checklistPercent: 80 }],
        plans: [{ id: "1", category: "supplement", name: "Vi chất theo đơn", dose_display: "1 viên", times_per_day: 1, instructions: "Sau ăn", confirmed_by_clinician: true, active: true }],
        records: [{
          id: "2", kind: "ultrasound", status: "completed", occurredAt: "2026-08-30T08:00:00Z", title: "Siêu âm", provider: "Nơi khám", clinician: "", notes: "Lời dặn", gestationalWeek: 7, nextAppointmentAt: null,
          measurements: { fetalHeartRate: 150 }, medicines: [], documents: []
        }]
      }
    });
    const serialized = JSON.stringify(document);

    expect(serialized).toContain("Mẹ Ngân");
    expect(serialized).toContain("Sức khỏe đã ghi");
    expect(serialized).toContain("Nhịp tim thai");
    expect(serialized).toContain("Vi chất theo đơn");
    expect(serialized).toContain("không thay thế đơn thuốc");
  });
});
