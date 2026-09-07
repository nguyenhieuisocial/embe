import type { FamilyMember } from "./family-members";
import type { MealMenuHistory, MealType } from "./pregnancy-menu";
import { dateInVietnam } from "./family-task-contract";
import { calculatePregnancyWeek } from "./pregnancy";

export const FOOD_ALLERGENS = {
  milk: "Sữa", egg: "Trứng", fish: "Cá", shellfish: "Tôm, cua, nhuyễn thể",
  peanut: "Đậu phộng", tree_nut: "Hạt cây", soy: "Đậu nành", gluten: "Lúa mì / gluten", sesame: "Mè"
} as const;
export type FoodAllergen = keyof typeof FOOD_ALLERGENS;
export type NutritionContext = { allergies: string; medicalNotes: string; dueDate: string | null };
type Choice = { title: string; meals: MealType[]; allergens: FoodAllergen[]; vegan: boolean; vegetarian: boolean; groups: string[]; gentle?: boolean };
// Explicit recipe ingredients, not an AI claim about restaurant preparations.
// A recipe must still be checked for sauces, labels and cross-contact when prepared.
export const PERSONAL_MENU_CHOICES: Choice[] = [
  { title: "Cháo gà chín kỹ, bí đỏ", meals: ["breakfast", "lunch", "dinner"], allergens: ["fish"], vegan: false, vegetarian: false, groups: ["protein", "vegetables"], gentle: true },
  { title: "Cơm, cá hồi chín kỹ, cải xanh", meals: ["lunch", "dinner"], allergens: ["fish"], vegan: false, vegetarian: false, groups: ["protein", "vegetables"] },
  { title: "Cơm, bò xào chín kỹ, bông cải", meals: ["lunch", "dinner"], allergens: ["fish", "soy", "gluten"], vegan: false, vegetarian: false, groups: ["protein", "vegetables"] },
  { title: "Cơm, đậu phụ hấp, canh bí đỏ; nêm muối, không nước mắm", meals: ["lunch", "dinner"], allergens: ["soy"], vegan: true, vegetarian: true, groups: ["protein", "vegetables"], gentle: true },
  { title: "Cháo đậu xanh, cà rốt chín; nêm muối, không nước mắm", meals: ["breakfast", "lunch", "dinner"], allergens: [], vegan: true, vegetarian: true, groups: ["protein", "vegetables"], gentle: true },
  { title: "Khoai lang, trứng luộc chín kỹ", meals: ["breakfast", "snack"], allergens: ["egg"], vegan: false, vegetarian: true, groups: ["protein"], gentle: true },
  { title: "Sữa chua tiệt trùng không đường, chuối", meals: ["breakfast", "snack"], allergens: ["milk"], vegan: false, vegetarian: true, groups: ["dairy", "fruit"] },
  { title: "Yến mạch nấu chín với sữa tiệt trùng, táo", meals: ["breakfast"], allergens: ["milk", "gluten"], vegan: false, vegetarian: true, groups: ["dairy", "fruit"], gentle: true },
  { title: "Đậu lăng hầm rau củ, cơm; không bơ sữa, không nước mắm", meals: ["lunch", "dinner"], allergens: [], vegan: true, vegetarian: true, groups: ["protein", "vegetables"] },
  { title: "Thanh long, khoai lang hấp", meals: ["snack", "breakfast"], allergens: [], vegan: true, vegetarian: true, groups: ["fruit"], gentle: true },
  { title: "Sữa đậu nành tiệt trùng không đường, chuối", meals: ["snack", "breakfast"], allergens: ["soy"], vegan: true, vegetarian: true, groups: ["protein", "fruit"] },
  { title: "Cơm, tôm hấp chín, rau củ luộc", meals: ["lunch", "dinner"], allergens: ["shellfish", "fish"], vegan: false, vegetarian: false, groups: ["protein", "vegetables"] }
];
const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ALLERGEN_TERMS: Record<FoodAllergen, string[]> = {
  milk: ["sua", "milk", "dairy", "lactose"], egg: ["trung", "egg"], fish: ["ca", "fish", "nuoc mam"],
  shellfish: ["tom", "cua", "so", "oc", "hau", "hai san", "shellfish", "shrimp"], peanut: ["dau phong", "lac", "peanut"],
  tree_nut: ["hanh nhan", "hat dieu", "oc cho", "tree nut"], soy: ["dau nanh", "dau phu", "soy"],
  gluten: ["lua mi", "gluten", "wheat"], sesame: ["me", "vung", "sesame"]
};
export function recordedFoodAllergens(member: FamilyMember, context: NutritionContext): FoodAllergen[] {
  const words = ` ${fold(`${context.allergies} ${member.details.allergies ?? ""}`)} `;
  // Conservative inclusion, including ambiguous/negated notes. The user can fix
  // the source profile; a recommendation must not silently override that source.
  return (Object.keys(ALLERGEN_TERMS) as FoodAllergen[]).filter(code => ALLERGEN_TERMS[code].some(term => words.includes(` ${term} `)));
}

export function nutritionContextText(member: FamilyMember, context: NutritionContext): string {
  // Any upstream change invalidates the previous review, even if the changed note cannot be interpreted.
  return JSON.stringify([context.allergies, context.medicalNotes, member.details.allergyStatus ?? "", member.details.allergies ?? "",
    member.details.conditions ?? "", member.details.clinicianGoals ?? "", member.details.diet ?? ""]);
}
export async function nutritionContextHash(member: FamilyMember, context: NutritionContext): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nutritionContextText(member, context)));
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, "0")).join("");
}

export function personalizedMealMenus(member: FamilyMember, context: NutritionContext, contextHash: string,
  meal: MealType, history: MealMenuHistory[], now = new Date()): { menus: { title: string; reason: string }[]; notice: string } {
  const d = member.details;
  if (!contextHash || d.nutritionContextHash !== contextHash || d.nutritionReviewed !== "Đã đối chiếu") {
    return { menus: [], notice: "Đối chiếu dị ứng và chế độ ăn trước khi nhận gợi ý riêng." };
  }
  if (d.nutritionSpecialDiet !== "Không" || d.nutritionClinicianPlan?.trim() || context.medicalNotes.trim()
    || d.conditions?.trim() || d.clinicianGoals?.trim()) {
    return { menus: [], notice: "Hồ sơ có chế độ riêng hoặc tiền sử cần đối chiếu với bác sĩ. EmBe chưa tự chọn món hay thay đổi chỉ định này." };
  }
  const allergens = [...new Set([...(d.foodAllergenCodes ?? "").split(",").filter(Boolean), ...recordedFoodAllergens(member, context)])];
  if (allergens.some(code => !Object.hasOwn(FOOD_ALLERGENS, code))) return { menus: [], notice: "Cần rà soát lại danh sách dị ứng." };
  const avoid = (d.foodAvoidTerms ?? "").split(/[\n,;]/).map(fold).filter(Boolean);
  const diet = d.nutritionDietPattern ?? "Ăn đa dạng";
  const week = calculatePregnancyWeek(context.dueDate ?? "", now);
  const today = dateInVietnam(now);
  const loggedHistory = history.filter(entry => entry.eatenAt && Number.isFinite(Date.parse(entry.eatenAt)) && Date.parse(entry.eatenAt) <= now.getTime());
  const todayEntries = loggedHistory.filter(entry => dateInVietnam(new Date(entry.eatenAt!)) === today);
  const groups = new Set(todayEntries.flatMap(entry => entry.foods.flatMap(food => food.foodGroups)));
  const recent = new Set(loggedHistory.flatMap(entry => [entry.note, ...entry.foods.map(food => food.nameVi)]).map(fold));
  const matches = PERSONAL_MENU_CHOICES.filter(choice => choice.meals.includes(meal)
    && !choice.allergens.some(code => allergens.includes(code))
    && !avoid.some(term => ` ${fold(choice.title)} `.includes(` ${term} `))
    && (diet !== "Thuần chay" || choice.vegan) && (diet !== "Chay có trứng / sữa" || choice.vegetarian));
  const score = (choice: Choice) => choice.groups.filter(group => !groups.has(group)).length
    + (week !== null && week <= 13 && choice.gentle ? 1 : 0) - (recent.has(fold(choice.title)) ? 3 : 0);
  return {
    menus: matches.sort((a, b) => score(b) - score(a)).slice(0, 3).map(choice => ({ title: choice.title,
      reason: week !== null && week <= 13 && choice.gentle ? "Món mềm, vị nhẹ để cân nhắc khi ăn khó chịu"
        : todayEntries.length ? "Đổi món dựa trên các bữa đã ghi hôm nay" : "Phù hợp bộ lọc đã xác nhận; chưa có bữa hôm nay để đối chiếu" })),
    notice: matches.length ? "Kiểm tra nhãn, gia vị và nhiễm chéo khi chế biến. Nhật ký chưa đủ để kết luận thiếu chất; gợi ý không phải chỉ định điều trị."
      : "Chưa có món phù hợp tất cả bộ lọc. EmBe không bỏ qua dị ứng để lấp danh sách." }
}
