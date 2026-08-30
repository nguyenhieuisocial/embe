const PREGNANCY_DAYS = 280;
const MILLISECONDS_PER_DAY = 86_400_000;

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function calculatePregnancyWeek(dueDate: string, today = new Date()): number | null {
  const due = parseLocalDate(dueDate);
  if (!due || Number.isNaN(today.getTime())) return null;

  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const conceptionCalendarStart = new Date(due);
  conceptionCalendarStart.setDate(conceptionCalendarStart.getDate() - PREGNANCY_DAYS);
  const elapsedDays = Math.floor(
    (localToday.getTime() - conceptionCalendarStart.getTime()) / MILLISECONDS_PER_DAY
  );

  if (elapsedDays < 0 || elapsedDays > PREGNANCY_DAYS + 7) return null;

  return Math.max(1, Math.floor(elapsedDays / 7));
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
