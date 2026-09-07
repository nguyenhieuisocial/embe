import { describe, expect, it } from "vitest";
import { PERSONAL_MENU_CHOICES, personalizedMealMenus, recordedFoodAllergens, nutritionContextText } from "../src/lib/personalized-meal-menu";
import { validMemberRecord, type FamilyMember, type MemberRecord } from "../src/lib/family-members";
import { validMedicalMeasurements, medicalMeasurementSeries } from "../src/lib/medical-measurements";
import { BIRTH_RECOVERY_STEPS } from "../src/lib/birth-recovery-plan";
import type { MedicalRecord } from "../src/lib/pregnancy-medical";

const member: FamilyMember = { id: "11111111-1111-4111-8111-111111111111", role: "mother", fullName: "Mẹ thử nghiệm", preferredName: "Mẹ", birthDate: null,
  sexAtBirth: "female", revision: 1, archived: false, details: { nutritionReviewed: "Đã đối chiếu", nutritionContextHash: "review", nutritionSpecialDiet: "Không" } };
const context = { allergies: "", medicalNotes: "", dueDate: null };
const now = new Date("2026-09-07T05:00:00Z");
const result = (details = {}, ctx = context) => personalizedMealMenus({ ...member, details: { ...member.details, ...details } }, ctx, "review", "lunch", [], now);
describe("personal nutrition safety and matching", () => {
  it("requires current reviewed context before proposing any meal", () => {
    expect(result({ nutritionContextHash: "old" }).menus).toEqual([]);
    expect(result({ nutritionReviewed: "" }).menus).toEqual([]);
    expect(nutritionContextText(member, context)).not.toBe(nutritionContextText(member, { ...context, allergies: "sữa" }));
  });
  it("does not bypass any selected allergens when choices are limited", () => {
    const codes = ["milk", "egg", "fish", "shellfish", "peanut", "tree_nut", "soy", "gluten", "sesame"];
    for (const menu of result({ foodAllergenCodes: codes.join(",") }).menus) {
      expect(PERSONAL_MENU_CHOICES.find(c => c.title === menu.title)?.allergens).toEqual([]);
    }
    expect(result({ foodAvoidTerms: "cơm\ncháo" }).menus).toEqual([]);
  });
  it("also filters allergy notes already recorded in the source profile", () => {
    const ctx = { ...context, allergies: "Dị ứng cá và tôm, sữa" };
    expect(recordedFoodAllergens(member, ctx)).toEqual(expect.arrayContaining(["fish", "shellfish", "milk"]));
    for (const menu of result({}, ctx).menus) expect(PERSONAL_MENU_CHOICES.find(c => c.title === menu.title)!.allergens.some(c => ["fish", "shellfish", "milk"].includes(c))).toBe(false);
  });
  it("never turns medical instructions into automatic treatment", () => {
    for (const details of [{ nutritionSpecialDiet: "Có" }, { nutritionClinicianPlan: "Theo thực đơn được kê" }, { conditions: "Theo dõi đường huyết" }, { clinicianGoals: "Theo chỉ định" }]) expect(result(details).menus).toEqual([]);
    expect(result({}, { ...context, medicalNotes: "Hỏi lại bác sĩ" }).menus).toEqual([]);
  });
  it("honors a vegan choice and does not infer deficiencies from incomplete records", () => {
    const plan = result({ nutritionDietPattern: "Thuần chay" });
    for (const menu of plan.menus) expect(PERSONAL_MENU_CHOICES.find(c => c.title === menu.title)!.vegan).toBe(true);
    expect(plan.notice).toContain("chưa đủ để kết luận thiếu chất");
    const future = personalizedMealMenus(member, context, "review", "lunch", [{ eatenAt: "2026-09-07T12:00:00Z", mealType: "dinner", note: "", foods: [] }], now);
    expect(future.menus[0].reason).toContain("chưa có bữa hôm nay");
  });
});

const reading: MemberRecord = { id: "22222222-2222-4222-8222-222222222222", memberId: member.id, kind: "measurement", title: "Đo đường huyết",
  occurredAt: "2026-09-01T05:00:00Z", notes: "", source: "Nhập tay", nextDueDate: null, metric: "glucoseMg", value: 100, secondaryValue: null,
  unit: "mg/dL", measurementContext: "after_meal_1h", revision: 0, deleted: false };
describe("individual health readings and structured records", () => {
  it("accepts separate readings within the same day and rejects wrong units/context", () => {
    expect(validMemberRecord(reading)).toBe(true);
    expect(validMemberRecord({ ...reading, id: "33333333-3333-4333-8333-333333333333", occurredAt: "2026-09-01T07:00:00Z", measurementContext: "after_meal_2h" })).toBe(true);
    expect(validMemberRecord({ ...reading, unit: "mmol/L" })).toBe(false);
    expect(validMemberRecord({ ...reading, measurementContext: "normal" })).toBe(false);
  });
  it("validates numeric units without inventing reference ranges", () => {
    expect(validMedicalMeasurements({ crlMm: 48, glucoseMmoll: 5, ferritinNgml: 0 })).toBe(true);
    expect(validMedicalMeasurements({ crlMm: "48 mm" })).toBe(false);
    expect(validMedicalMeasurements({ crlMm: Infinity })).toBe(false);
    expect(validMedicalMeasurements({ crlMm: -1 })).toBe(false);
    expect(validMedicalMeasurements({ legacyValue: 12 })).toBe(true);
  });
  it("does not mix planned visits or mg/dL with mmol/L in a series", () => {
    const record: MedicalRecord = { id: reading.id, kind: "laboratory", status: "completed", occurredAt: "2026-09-01T05:00:00Z", title: "Xét nghiệm", provider: "", clinician: "", notes: "", gestationalWeek: 12, nextAppointmentAt: null, measurements: { glucoseMgdl: 100 }, medicines: [], documents: [] };
    expect(medicalMeasurementSeries([record, { ...record, status: "planned" }, { ...record, measurements: { glucoseMmoll: 5 } }], "glucoseMgdl")).toHaveLength(1);
    expect(medicalMeasurementSeries([record], "unknown")).toEqual([]);
  });
  it("has separate birth and recovery steps with a clear owner and destination", () => {
    expect(new Set(BIRTH_RECOVERY_STEPS.map(s => s.id)).size).toBe(BIRTH_RECOVERY_STEPS.length);
    expect(BIRTH_RECOVERY_STEPS.some(s => s.phase === "prepare" && s.ownerRole === "father")).toBe(true);
    expect(BIRTH_RECOVERY_STEPS.some(s => s.phase === "recovery" && s.ownerRole === "father")).toBe(true);
  });
});
