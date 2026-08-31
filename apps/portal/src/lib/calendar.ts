import { LichTa } from "@lichta/core";

export const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

function vietnamDateParts(value: Date): { day: number; month: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: VIETNAM_TIME_ZONE,
    year: "numeric"
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  return { day: part("day"), month: part("month"), year: part("year") };
}

export function dateKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const { day, month, year } = vietnamDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseDateKey(value?: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return year >= 1800 && year <= 2199 && date.getFullYear() === year
    && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function calendarMonth(
  value?: string,
  now: Date = new Date()
): { month: number; year: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year >= 1800 && year <= 2199 && month >= 1 && month <= 12) return { month, year };
  }
  const current = vietnamDateParts(now);
  return { month: current.month, year: current.year };
}

export function monthKey(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function adjacentMonth(month: number, year: number, offset: -1 | 1): string {
  const value = new Date(year, month - 1 + offset, 1);
  return monthKey(value.getMonth() + 1, value.getFullYear());
}

export function monthRange(month: number, year: number): { from: string; to: string } {
  const current = monthKey(month, year);
  const next = adjacentMonth(month, year, 1);
  return {
    from: `${current}-01T00:00:00+07:00`,
    to: `${next}-01T00:00:00+07:00`
  };
}

export function dayRange(value: string): { from: string; to: string } | null {
  const date = parseDateKey(value);
  if (!date) return null;
  const tomorrow = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return {
    from: `${value}T00:00:00+07:00`,
    to: `${dateKey(tomorrow)}T00:00:00+07:00`
  };
}

export function lunarDateLabel(value: Date): string {
  const { day, month, year } = vietnamDateParts(value);
  const lunar = LichTa.toLunar(day, month, year);
  return `${lunar.day}/${lunar.month}${lunar.isLeap ? " N" : ""}`;
}

export function lunarDateLong(value: Date): string {
  const { day, month, year } = vietnamDateParts(value);
  const lunar = LichTa.toLunar(day, month, year);
  return `Âm lịch ${lunar.day} tháng ${lunar.month}${lunar.isLeap ? " nhuận" : ""}, năm ${lunar.yearCanChi ?? lunar.year}`;
}
