const DAY = 86_400_000;

type CareWindow = {
  kind: "suggested_window";
  startWeek: number;
  endWeek: number;
  weekLabel: string;
  dateLabel: string;
  title: string;
  note: string;
};

const WINDOWS = [
  { startWeek: 10, endWeek: 13, title: "Sàng lọc ba tháng đầu", note: "Hỏi bác sĩ về lựa chọn phù hợp như NIPT, siêu âm và xét nghiệm sàng lọc; không tự chọn chỉ dựa trên ứng dụng." },
  { startWeek: 18, endWeek: 22, title: "Siêu âm giữa thai kỳ", note: "Xác nhận lịch siêu âm hình thái và các đánh giá phù hợp với hồ sơ của Mẹ và Bé." },
  { startWeek: 24, endWeek: 28, title: "Khám và theo dõi đường huyết", note: "Hỏi nơi khám về xét nghiệm dung nạp đường, huyết áp và những xét nghiệm cần thiết khác." },
  { startWeek: 28, endWeek: 32, title: "Khám đầu ba tháng cuối", note: "Rà lại tăng trưởng của Bé, sức khỏe của Mẹ và kế hoạch các lần tái khám." },
  { startWeek: 35, endWeek: 37, title: "Chốt kế hoạch sinh", note: "Hỏi nơi khám về những xét nghiệm cuối thai kỳ, dấu hiệu cần gọi và thời điểm đến viện dành riêng cho Mẹ." },
  { startWeek: 38, endWeek: 40, title: "Theo dõi sát ngày sinh", note: "Giữ hồ sơ, giỏ đi sinh, đường đến viện và số liên hệ trong tầm tay." }
] as const;

function dueDateUtc(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateAtWeek(dueDate: Date, week: number): Date {
  return new Date(dueDate.getTime() - 280 * DAY + week * 7 * DAY);
}

function dateRange(start: Date, end: Date): string {
  const part = (date: Date, name: "day" | "month" | "year") => new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC"
  }).formatToParts(date).find((item) => item.type === name)?.value ?? "";
  return `${part(start, "day")}/${part(start, "month")}–${part(end, "day")}/${part(end, "month")}/${part(end, "year")}`;
}

export function upcomingPregnancyCareWindows(dueDateValue: string, currentWeek: number, limit = 3): CareWindow[] {
  const dueDate = dueDateUtc(dueDateValue);
  if (!dueDate || !Number.isInteger(currentWeek) || limit < 1) return [];
  return WINDOWS.filter((item) => item.endWeek >= currentWeek).slice(0, Math.min(limit, 5)).map((item) => ({
    kind: "suggested_window",
    ...item,
    weekLabel: `${item.startWeek}–${item.endWeek} tuần`,
    dateLabel: dateRange(dateAtWeek(dueDate, item.startWeek), dateAtWeek(dueDate, item.endWeek))
  }));
}
