export type NutrientKey =
  | "folate_ug" | "iron_mg" | "calcium_mg" | "iodine_ug" | "choline_mg"
  | "vitamin_d_ug" | "vitamin_b12_ug" | "vitamin_b6_mg" | "vitamin_a_ug_rae"
  | "zinc_mg" | "magnesium_mg" | "ala_g";

export type NutrientReference = {
  key: NutrientKey;
  label: string;
  target: number;
  unit: string;
  upper?: number;
  upperNote?: string;
  foodExamples: string;
};

// NIH ODS / National Academies DRI values for pregnancy, age 19–50.
// Targets include food and supplements unless upperNote says otherwise.
export const PREGNANCY_NUTRIENTS: NutrientReference[] = [
  { key: "folate_ug", label: "Folate", target: 600, unit: "µg DFE", upper: 1000, upperNote: "Giới hạn trên chỉ áp dụng folic acid từ viên/đồ tăng cường.", foodExamples: "rau lá xanh, đậu, thực phẩm tăng cường" },
  { key: "iron_mg", label: "Sắt", target: 27, unit: "mg", upper: 45, foodExamples: "thịt nạc chín kỹ, đậu, rau xanh" },
  { key: "calcium_mg", label: "Canxi", target: 1000, unit: "mg", upper: 2500, foodExamples: "sữa tiệt trùng, sữa chua, đậu phụ" },
  { key: "iodine_ug", label: "I-ốt", target: 220, unit: "µg", upper: 1100, foodExamples: "muối i-ốt, sữa, trứng, hải sản phù hợp" },
  { key: "choline_mg", label: "Choline", target: 450, unit: "mg", upper: 3500, foodExamples: "trứng chín kỹ, thịt, cá, đậu nành" },
  { key: "vitamin_d_ug", label: "Vitamin D", target: 15, unit: "µg (600 IU)", upper: 100, foodExamples: "cá phù hợp, trứng, thực phẩm tăng cường" },
  { key: "vitamin_b12_ug", label: "Vitamin B12", target: 2.6, unit: "µg", foodExamples: "thịt, cá, trứng, sữa hoặc thực phẩm tăng cường" },
  { key: "vitamin_b6_mg", label: "Vitamin B6", target: 1.9, unit: "mg", upper: 100, foodExamples: "thịt gia cầm, cá, khoai, chuối" },
  { key: "vitamin_a_ug_rae", label: "Vitamin A", target: 770, unit: "µg RAE", upper: 3000, upperNote: "Giới hạn trên chỉ áp dụng vitamin A dạng retinol, không áp dụng beta-carotene.", foodExamples: "rau củ màu vàng/cam, rau xanh, trứng" },
  { key: "zinc_mg", label: "Kẽm", target: 11, unit: "mg", upper: 40, foodExamples: "thịt, hải sản chín kỹ, đậu, hạt" },
  { key: "magnesium_mg", label: "Magie", target: 350, unit: "mg", upper: 350, upperNote: "Giới hạn trên chỉ áp dụng magie từ viên/thuốc, không áp dụng từ thức ăn.", foodExamples: "hạt, đậu, ngũ cốc nguyên cám, rau xanh" },
  { key: "ala_g", label: "Omega-3 ALA", target: 1.4, unit: "g", foodExamples: "óc chó, hạt chia, hạt lanh, dầu thực vật" }
];

export type EnergyProfile = {
  birthDate: string | null;
  heightCm: number | null;
  prePregnancyWeightKg: number | null;
  activityLevel: "sedentary" | "low_active" | "active" | "very_active" | null;
  clinicianEnergyTargetKcal: number | null;
};

const ENERGY_EQUATION = {
  sedentary: { intercept: 584.90, height: 5.72, weight: 11.71 },
  low_active: { intercept: 575.77, height: 6.60, weight: 12.14 },
  active: { intercept: 710.25, height: 6.54, weight: 12.34 },
  very_active: { intercept: 511.83, height: 9.07, weight: 12.56 }
} as const;

export function estimatedEnergyTarget(profile: EnergyProfile, pregnancyWeek: number | null, now = new Date()): number | null {
  if (profile.clinicianEnergyTargetKcal) return profile.clinicianEnergyTargetKcal;
  if (!profile.birthDate || !profile.heightCm || !profile.prePregnancyWeightKg || !profile.activityLevel) return null;
  const birth = new Date(`${profile.birthDate}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayPassed = now.getUTCMonth() > birth.getUTCMonth()
    || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate());
  if (!birthdayPassed) age -= 1;
  if (age < 14 || age > 60) return null;
  const equation = ENERGY_EQUATION[profile.activityLevel];
  const base = equation.intercept - (7.01 * age) + (equation.height * profile.heightCm)
    + (equation.weight * profile.prePregnancyWeightKg);
  const addition = pregnancyWeek === null || pregnancyWeek <= 12 ? 0 : pregnancyWeek <= 26 ? 340 : 450;
  return Math.round((base + addition) / 10) * 10;
}
