import catalog from "./vietnamese-food-catalog.json";

type FoodCatalogEntry = { name: string; query: string; aliases: string[] };

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLocaleLowerCase("vi").replace(/[^a-z0-9]+/g, " ").trim();
}

export const VIETNAMESE_POPULAR_FOODS = catalog as FoodCatalogEntry[];

export function suggestPopularFoods(value: string, limit = 5): string[] {
  const needle = fold(value);
  if (needle.length < 2) return [];
  return VIETNAMESE_POPULAR_FOODS
    .map((entry) => {
      const candidates = [entry.name, ...entry.aliases].map(fold);
      const exact = candidates.some((candidate) => candidate === needle);
      const prefix = candidates.some((candidate) => candidate.startsWith(needle));
      const contains = candidates.some((candidate) => candidate.includes(needle));
      return { name: entry.name, score: exact ? 0 : prefix ? 1 : contains ? 2 : 3 };
    })
    .filter((entry) => entry.score < 3)
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, "vi"))
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.name);
}
