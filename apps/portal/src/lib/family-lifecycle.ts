import { calculatePregnancyWeek } from "./pregnancy";

export type FamilyStage =
  | "pregnancy-unknown"
  | "pregnancy-early"
  | "pregnancy-mid"
  | "pregnancy-late"
  | "pregnancy-term"
  | "postpartum-0-6w"
  | "postpartum-6w-6m"
  | "baby-6-24m"
  | "baby-2y-plus";

export type FamilyLifecycleDates = {
  dueDate: string | null;
  birthOccurredAt: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function deriveFamilyStage(
  lifecycle: FamilyLifecycleDates,
  now: Date = new Date()
): FamilyStage {
  if (lifecycle.birthOccurredAt) {
    const birth = new Date(lifecycle.birthOccurredAt);
    const ageDays = Math.floor((now.getTime() - birth.getTime()) / DAY_MS);
    if (!Number.isFinite(ageDays) || ageDays < 0) return "pregnancy-unknown";
    if (ageDays < 42) return "postpartum-0-6w";
    if (ageDays < 183) return "postpartum-6w-6m";
    if (ageDays < 731) return "baby-6-24m";
    return "baby-2y-plus";
  }

  const week = calculatePregnancyWeek(lifecycle.dueDate ?? "", now);
  if (week === null) return "pregnancy-unknown";
  if (week <= 13) return "pregnancy-early";
  if (week <= 27) return "pregnancy-mid";
  if (week <= 36) return "pregnancy-late";
  return "pregnancy-term";
}

export function isPostpartumStage(stage: FamilyStage): boolean {
  return stage.startsWith("postpartum-") || stage.startsWith("baby-");
}
