// Large chicken egg, edible portion. This is an estimate, not a measured weight.
// Health Canada: https://food-nutrition.canada.ca/cnf-fce/serving-portion?id=130
export const BOILED_EGG_GRAMS = 50;
export function isBoiledChickenEgg(name: string) {
  const normalized = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
  return /^(?:trung(?: ga)? luoc(?: chin(?: ky)?)?|boiled eggs?|hard[ -]boiled eggs?)$/.test(normalized);
}
export function foodPortionLabel(name: string, grams: number | null) {
  if (!grams) return '';
  return isBoiledChickenEgg(name)
    ? `≈ ${(grams / BOILED_EGG_GRAMS).toLocaleString('vi-VN', {maximumFractionDigits: 2})} quả`
    : `${grams} g`;
}
