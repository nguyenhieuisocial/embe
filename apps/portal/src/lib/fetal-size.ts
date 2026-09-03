export type FetalSize = {
  week: number;
  comparison: string;
  emoji: string;
  lengthCm: number | null;
};

const FETAL_SIZES: FetalSize[] = [
  { week: 4, comparison: "một hạt anh túc", emoji: "·", lengthCm: null },
  { week: 5, comparison: "một hạt mè", emoji: "•", lengthCm: 0.2 },
  { week: 6, comparison: "một hạt đậu", emoji: "🫘", lengthCm: 0.6 },
  { week: 7, comparison: "một quả nho", emoji: "🍇", lengthCm: 1 },
  { week: 8, comparison: "một quả mâm xôi", emoji: "🫐", lengthCm: 1.6 },
  { week: 9, comparison: "một quả dâu tây", emoji: "🍓", lengthCm: 2.2 },
  { week: 10, comparison: "một quả mơ", emoji: "🍑", lengthCm: 3 },
  { week: 11, comparison: "một quả sung", emoji: "🟣", lengthCm: 4.1 },
  { week: 12, comparison: "một quả mận", emoji: "🟣", lengthCm: 5.4 },
  { week: 13, comparison: "một quả đào", emoji: "🍑", lengthCm: 7.4 },
  { week: 14, comparison: "một quả kiwi", emoji: "🥝", lengthCm: 8.5 },
  { week: 15, comparison: "một quả táo", emoji: "🍎", lengthCm: 10.1 },
  { week: 16, comparison: "một quả bơ", emoji: "🥑", lengthCm: 11.6 },
  { week: 17, comparison: "một quả lựu", emoji: "🔴", lengthCm: 12 },
  { week: 18, comparison: "một quả ớt chuông", emoji: "🫑", lengthCm: 14.2 },
  { week: 19, comparison: "một quả cà chua lớn", emoji: "🍅", lengthCm: 15.3 },
  { week: 20, comparison: "một quả chuối", emoji: "🍌", lengthCm: 25.6 },
  { week: 21, comparison: "một củ cà rốt", emoji: "🥕", lengthCm: 26.7 },
  { week: 22, comparison: "một củ khoai lang", emoji: "🍠", lengthCm: 27.8 },
  { week: 23, comparison: "một quả xoài lớn", emoji: "🥭", lengthCm: 28.9 },
  { week: 24, comparison: "một bắp ngô", emoji: "🌽", lengthCm: 30 },
  { week: 25, comparison: "một quả bí ngòi", emoji: "🥒", lengthCm: 34.6 },
  { week: 26, comparison: "một quả dưa leo", emoji: "🥒", lengthCm: 35.6 },
  { week: 27, comparison: "một bông súp lơ", emoji: "🥦", lengthCm: 36.6 },
  { week: 28, comparison: "một quả cà tím", emoji: "🍆", lengthCm: 37.6 },
  { week: 29, comparison: "một quả bí hồ lô", emoji: "🎃", lengthCm: 38.6 },
  { week: 30, comparison: "một bắp cải", emoji: "🥬", lengthCm: 39.9 },
  { week: 31, comparison: "một quả dừa", emoji: "🥥", lengthCm: 41.1 },
  { week: 32, comparison: "một bó cần tây", emoji: "🌿", lengthCm: 42.4 },
  { week: 33, comparison: "một quả dứa", emoji: "🍍", lengthCm: 43.7 },
  { week: 34, comparison: "một quả dưa lưới", emoji: "🍈", lengthCm: 45 },
  { week: 35, comparison: "một quả dưa vàng", emoji: "🍈", lengthCm: 46.2 },
  { week: 36, comparison: "một cây xà lách", emoji: "🥬", lengthCm: 47.4 },
  { week: 37, comparison: "một cây tỏi tây", emoji: "🌿", lengthCm: 48.6 },
  { week: 38, comparison: "một thân đại hoàng", emoji: "🌿", lengthCm: 49.8 },
  { week: 39, comparison: "một quả dưa hấu nhỏ", emoji: "🍉", lengthCm: 50.7 },
  { week: 40, comparison: "một quả bí ngô", emoji: "🎃", lengthCm: 51.2 }
];

export function fetalSizeForWeek(value: number): FetalSize | null {
  if (!Number.isFinite(value)) return null;
  const week = Math.min(40, Math.max(4, Math.round(value)));
  return FETAL_SIZES[week - 4] ?? null;
}

export function fetalSizeSourceUrl(week: number): string {
  const safeWeek = Math.min(40, Math.max(4, Math.round(week)));
  const trimester = safeWeek <= 12 ? "1st-trimester" : safeWeek <= 27 ? "2nd-trimester" : "3rd-trimester";
  return `https://www.nhs.uk/best-start-in-life/pregnancy/week-by-week-guide-to-pregnancy/${trimester}/week-${safeWeek}/`;
}
