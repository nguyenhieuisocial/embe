import { dateKey, lunarDateLong, parseDateKey } from "./calendar";

export type FamilyParentRole = "mother" | "father";

export type FamilyProfile = {
  motherBirthDate: string | null;
  fatherBirthDate: string | null;
};

export const EMPTY_FAMILY_PROFILE: FamilyProfile = {
  motherBirthDate: null,
  fatherBirthDate: null
};

export function validBirthDate(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const parsed = parseDateKey(value);
  if (!parsed || value < "1940-01-01") return undefined;
  return value <= dateKey(new Date()) ? value : undefined;
}

export function ageOnDate(birthDate: string, onDate = new Date()): number | null {
  const birth = parseDateKey(birthDate);
  if (!birth || birth > onDate) return null;
  let age = onDate.getFullYear() - birth.getFullYear();
  const birthdayPassed = onDate.getMonth() > birth.getMonth()
    || (onDate.getMonth() === birth.getMonth() && onDate.getDate() >= birth.getDate());
  if (!birthdayPassed) age -= 1;
  return age;
}

export function nextBirthday(birthDate: string, from = new Date()): Date | null {
  const birth = parseDateKey(birthDate);
  if (!birth) return null;
  let candidate = new Date(from.getFullYear(), birth.getMonth(), birth.getDate());
  if (candidate.getMonth() !== birth.getMonth()) candidate = new Date(from.getFullYear(), 1, 28);
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (candidate < today) {
    candidate = new Date(from.getFullYear() + 1, birth.getMonth(), birth.getDate());
    if (candidate.getMonth() !== birth.getMonth()) candidate = new Date(from.getFullYear() + 1, 1, 28);
  }
  return candidate;
}

export function parentBirthSummary(birthDate: string, now = new Date()): string | null {
  const birth = parseDateKey(birthDate);
  const age = ageOnDate(birthDate, now);
  const upcoming = nextBirthday(birthDate, now);
  if (!birth || age === null || !upcoming) return null;
  const solar = birth.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const next = upcoming.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${solar} · ${age} tuổi · ${lunarDateLong(birth)} · sinh nhật tới ${next}`;
}
