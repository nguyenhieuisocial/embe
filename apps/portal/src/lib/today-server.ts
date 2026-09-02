import { getFamilyTasks } from "./family-tasks-server";
import { dateInVietnam } from "./family-task-contract";
import { photoStore } from "./photo-upload-server";
import { selectTodayPriorities, type TodayCarePlan, type TodayPriority } from "./today-priorities";

export type TodaySnapshot = { priorities: TodayPriority[]; unavailableSources: string[] };

function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function carePlans(value: unknown): TodayCarePlan[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>).plans)) return [];
  return ((value as Record<string, unknown>).plans as unknown[]).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.active !== "boolean"
        || !Array.isArray(row.reminder_times) || !row.reminder_times.every((time) => typeof time === "string")
        || !Array.isArray(row.taken_slots) || !row.taken_slots.every((slot) => typeof slot === "number")) return [];
    return [{ id: row.id, name: row.name, active: row.active, reminderTimes: row.reminder_times, takenSlots: row.taken_slots }];
  });
}

function hasHealthEntry(value: unknown, today: string): boolean {
  if (!Array.isArray(value)) return false;
  const row = value.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).day === today);
  if (!row || typeof row !== "object") return false;
  const record = row as Record<string, unknown>;
  return ["weight_kg", "systolic", "sleep_minutes", "water_glasses", "movement_minutes", "wellbeing", "blood_glucose_mg_dl", "fetal_movement_count"]
    .some((key) => record[key] !== null && record[key] !== undefined)
    || (Array.isArray(record.symptoms) && record.symptoms.length > 0)
    || (typeof record.health_note === "string" && record.health_note.length > 0);
}

function hasMealEntry(value: unknown, today: string): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((item) => {
    if (!item || typeof item !== "object" || typeof (item as Record<string, unknown>).eaten_at !== "string") return false;
    return dateInVietnam(new Date((item as Record<string, unknown>).eaten_at as string)) === today;
  });
}

export async function getTodaySnapshot(now = new Date()): Promise<TodaySnapshot> {
  const today = dateInVietnam(now);
  const unavailableSources: string[] = [];
  const store = photoStore();

  const tasksPromise = getFamilyTasks(shiftDay(today, -7), shiftDay(today, 7))
    .catch(() => { unavailableSources.push("lịch và việc"); return null; });
  const carePromise = store?.rpc("embe_get_pregnancy_care", { p_day: today });
  const healthPromise = store?.rpc("embe_get_pregnancy_health_history", { p_end_day: today, p_days: 7 });
  const mealsPromise = store?.rpc("embe_list_meal_history", { p_days: 7 });
  const profilePromise = store?.rpc("embe_get_pregnancy_profile");

  const [tasks, care, health, meals, profile] = await Promise.all([
    tasksPromise, carePromise, healthPromise, mealsPromise, profilePromise
  ]);

  if (!store) unavailableSources.push("thuốc, sức khỏe và bữa ăn");
  else {
    if (care?.error) unavailableSources.push("thuốc và vi chất");
    if (health?.error) unavailableSources.push("sức khỏe");
    if (meals?.error) unavailableSources.push("bữa ăn");
    if (profile?.error) unavailableSources.push("hồ sơ thai kỳ");
  }

  const rawProfile = profile?.data && typeof profile.data === "object" ? profile.data as Record<string, unknown> : null;
  const contacts = rawProfile && Array.isArray(rawProfile.contacts) ? rawProfile.contacts : [];
  return {
    priorities: selectTodayPriorities({
      now: now.toISOString(), today, tasks: tasks ?? [], carePlans: care?.error ? [] : carePlans(care?.data),
      hasHealthEntry: !store || !health || health.error ? null : hasHealthEntry(health.data, today),
      hasMealEntry: !store || !meals || meals.error ? null : hasMealEntry(meals.data, today),
      profileComplete: !store || profile?.error ? null : Boolean(rawProfile?.due_date && contacts.length)
    }),
    unavailableSources
  };
}
