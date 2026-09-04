export type MedicationCategory = "medicine" | "supplement";

export type MedicationCatalogItem = {
  name: string;
  category: MedicationCategory;
  detail: string;
  aliases: string[];
};

const MEDICATION_CATALOG: MedicationCatalogItem[] = [
  { name: "Axit folic", category: "supplement", detail: "Vi chất · vitamin B9", aliases: ["acid folic", "folic acid", "folate", "vitamin b9"] },
  { name: "Sắt", category: "supplement", detail: "Khoáng chất · iron", aliases: ["sat", "iron", "ferrous", "ferric"] },
  { name: "Canxi", category: "supplement", detail: "Khoáng chất · calcium", aliases: ["calcium", "calci"] },
  { name: "DHA / Omega-3", category: "supplement", detail: "Vi chất · DHA, omega-3", aliases: ["dha", "omega 3", "omega-3", "dầu cá"] },
  { name: "Vitamin D3", category: "supplement", detail: "Vi chất · cholecalciferol", aliases: ["vitamin d", "d3", "cholecalciferol"] },
  { name: "I-ốt", category: "supplement", detail: "Khoáng chất · iodine", aliases: ["i ot", "iodine", "iodide"] },
  { name: "Vitamin B12", category: "supplement", detail: "Vi chất · cobalamin", aliases: ["b12", "cobalamin"] },
  { name: "Magie", category: "supplement", detail: "Khoáng chất · magnesium", aliases: ["magnesium", "magie b6"] },
  { name: "Kẽm", category: "supplement", detail: "Khoáng chất · zinc", aliases: ["kem", "zinc"] },
  { name: "Vitamin tổng hợp thai kỳ", category: "supplement", detail: "Vi chất · prenatal multivitamin", aliases: ["prenatal", "multivitamin", "vitamin bau"] },
  { name: "Elevit Pronatal", category: "supplement", detail: "Tên sản phẩm · vitamin và khoáng chất", aliases: ["elevit", "elevit pronatal"] },
  { name: "Procare Diamond", category: "supplement", detail: "Tên sản phẩm · vitamin và khoáng chất", aliases: ["procare", "pm procare"] },
  { name: "Obimin", category: "supplement", detail: "Tên sản phẩm · vitamin và khoáng chất", aliases: ["obimin plus", "obimin"] },
  { name: "Pregnacare", category: "supplement", detail: "Tên sản phẩm · vitamin và khoáng chất", aliases: ["pregnacare original", "vitabiotics pregnacare"] },
  { name: "Blackmores Pregnancy & Breast-Feeding Gold", category: "supplement", detail: "Tên sản phẩm · vitamin và khoáng chất", aliases: ["blackmores pregnancy", "blackmores gold"] },
  { name: "Paracetamol", category: "medicine", detail: "Hoạt chất · còn gọi là acetaminophen", aliases: ["acetaminophen", "paracetamol"] },
  { name: "Aspirin", category: "medicine", detail: "Hoạt chất · acetylsalicylic acid", aliases: ["acetylsalicylic acid", "asa", "aspirin"] },
  { name: "Amoxicillin", category: "medicine", detail: "Hoạt chất · kháng sinh penicillin", aliases: ["amox", "amoxicillin"] },
  { name: "Progesterone", category: "medicine", detail: "Hoạt chất · nội tiết tố", aliases: ["progesteron", "utrogestan", "cyclogest"] },
  { name: "Dydrogesterone", category: "medicine", detail: "Hoạt chất · thường gặp với tên Duphaston", aliases: ["duphaston", "dydrogesterone"] },
  { name: "Nifedipine", category: "medicine", detail: "Hoạt chất · thuốc kê theo chỉ định", aliases: ["nifedipin", "nifedipine"] },
  { name: "Labetalol", category: "medicine", detail: "Hoạt chất · thuốc kê theo chỉ định", aliases: ["labetalol"] },
  { name: "Methyldopa", category: "medicine", detail: "Hoạt chất · thuốc kê theo chỉ định", aliases: ["methyldopa", "aldomet"] },
  { name: "Metformin", category: "medicine", detail: "Hoạt chất · thuốc kê theo chỉ định", aliases: ["metformin"] },
  { name: "Insulin", category: "medicine", detail: "Hoạt chất · thuốc kê theo chỉ định", aliases: ["insulin"] },
  { name: "Levothyroxine", category: "medicine", detail: "Hoạt chất · hormone tuyến giáp", aliases: ["levothyroxin", "thyroxine", "euthyrox"] },
  { name: "Doxylamine + pyridoxine", category: "medicine", detail: "Hoạt chất · thuốc kê theo chỉ định", aliases: ["doxylamine", "pyridoxine", "vitamin b6"] },
  { name: "Ondansetron", category: "medicine", detail: "Hoạt chất · thuốc kê theo chỉ định", aliases: ["ondansetron", "zofran"] }
];

function searchable(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/đ/gi, "d").toLocaleLowerCase("vi-VN").trim();
}

function score(item: MedicationCatalogItem, query: string): number | null {
  const name = searchable(item.name);
  const aliases = item.aliases.map(searchable);
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.split(/\s+/).some((word) => word.startsWith(query))) return 2;
  if (aliases.some((alias) => alias === query)) return 3;
  if (aliases.some((alias) => alias.startsWith(query))) return 4;
  const terms = query.split(/\s+/).filter(Boolean);
  const haystack = `${name} ${aliases.join(" ")}`;
  return terms.every((term) => haystack.includes(term)) ? 5 : null;
}

export function searchMedicationCatalog(query: string, limit = 6): MedicationCatalogItem[] {
  const normalized = searchable(query);
  if (!normalized || limit < 1) return [];
  return MEDICATION_CATALOG.flatMap((item, index) => {
    const rank = score(item, normalized);
    return rank === null ? [] : [{ item, rank, index }];
  }).sort((left, right) => left.rank - right.rank || left.index - right.index)
    .slice(0, limit)
    .map(({ item }) => item);
}
