export const weeklyMenu = [
  {
    day: "Ngày 1",
    breakfast: "Yến mạch, sữa tiệt trùng, chuối",
    lunch: "Cơm gạo lứt, cá hồi chín, cải xanh",
    dinner: "Canh gà nấm, đậu phụ, cam"
  },
  {
    day: "Ngày 2",
    breakfast: "Bánh mì nguyên cám, trứng chín, bơ",
    lunch: "Cơm, bò xào rau củ chín kỹ, thanh long",
    dinner: "Bún tôm chín, rau luộc, sữa chua tiệt trùng"
  },
  {
    day: "Ngày 3",
    breakfast: "Phở gà chín kỹ, rau đã rửa sạch",
    lunch: "Cơm, đậu phụ sốt cà, canh bí đỏ",
    dinner: "Cá basa kho chín, rau dền, lê"
  },
  {
    day: "Ngày 4",
    breakfast: "Khoai lang, trứng chín, sữa đậu nành tiệt trùng",
    lunch: "Cơm, thịt nạc chín kỹ, bông cải",
    dinner: "Miến gà, nấm chín, đu đủ"
  },
  {
    day: "Ngày 5",
    breakfast: "Cháo yến mạch thịt bằm chín, táo",
    lunch: "Cơm, tôm hấp chín, canh rau mồng tơi",
    dinner: "Đậu lăng hầm rau củ, bánh mì nguyên cám"
  },
  {
    day: "Ngày 6",
    breakfast: "Bún bò chín kỹ, giá được nấu chín",
    lunch: "Cơm, gà áp chảo chín, salad rau đã rửa kỹ",
    dinner: "Cháo cá hồi chín, bí xanh, quýt"
  },
  {
    day: "Ngày 7",
    breakfast: "Sữa chua tiệt trùng, yến mạch, xoài",
    lunch: "Cơm, cá mòi chín, rau củ hấp",
    dinner: "Mì trứng chín với đậu phụ và rau cải"
  }
] as const;

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type MealMenuHistory = {
  mealType: string;
  note: string;
  foods: Array<{ nameVi: string; foodGroups: string[] }>;
};

const snackMenus = [
  "Sữa chua tiệt trùng và chuối",
  "Khoai lang và sữa tiệt trùng",
  "Táo và một ít hạt không tẩm muối",
  "Thanh long và sữa chua tiệt trùng",
  "Bơ ăn cùng bánh mì nguyên cám",
  "Cam và trứng luộc chín kỹ",
  "Xoài và sữa đậu nành tiệt trùng"
] as const;

const supplements: Record<string, string> = {
  vegetables: "rau củ nấu chín",
  protein: "trứng chín kỹ",
  fruit: "một phần trái cây đã rửa sạch",
  dairy: "sữa chua tiệt trùng"
};

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLocaleLowerCase("vi").replace(/[^a-z0-9]+/g, " ").trim();
}

function hourInVietnam(date: Date): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh"
  }).formatToParts(date).find((part) => part.type === "hour")?.value;
  return Number(hour ?? 12) % 24;
}

function vietnamDayIndex(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Ho_Chi_Minh"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Math.floor(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day)) / 86_400_000) % 7;
}

export function currentMealType(date = new Date()): MealType {
  const hour = hourInVietnam(date);
  return hour < 10 ? "breakfast" : hour < 15 ? "lunch" : hour < 21 ? "dinner" : "snack";
}

export function suggestCurrentMealMenus(
  mealType: MealType,
  history: MealMenuHistory[],
  now = new Date(),
  limit = 3
): string[] {
  const source = mealType === "snack"
    ? [...snackMenus]
    : weeklyMenu.map((day) => day[mealType]);
  const offset = vietnamDayIndex(now);
  const rotated = source.map((_, index) => source[(index + offset) % source.length]);
  const recent = new Set(history.filter((entry) => entry.mealType === mealType)
    .flatMap((entry) => [entry.note, ...entry.foods.map((food) => food.nameVi)])
    .map(fold).filter(Boolean));
  const available = rotated.filter((menu) => !recent.has(fold(menu)));
  const seenGroups = new Set(history.flatMap((entry) => entry.foods.flatMap((food) => food.foodGroups)));
  const missingGroup = ["vegetables", "protein", "fruit", "dairy"].find((group) => !seenGroups.has(group));
  const menus = (available.length >= limit ? available : [...available, ...rotated.filter((menu) => !available.includes(menu))])
    .slice(0, Math.max(0, limit));
  if (!missingGroup) return menus;
  const supplement = supplements[missingGroup];
  return menus.map((menu, index) => index === 0 && !fold(menu).includes(fold(supplement))
    ? `${menu}; thêm ${supplement}`
    : menu);
}
