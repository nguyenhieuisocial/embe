export const LINKED_DAILY_ACTION_EVENT = "embe:daily-action-completed";

const LINKED_TASK_IDS = new Set(["supplements", "breakfast", "lunch", "dinner"]);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export type LinkedDailyAction = { taskId: string; day: string };

export function linkedDailyAction(value: unknown): LinkedDailyAction | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  return typeof input.taskId === "string" && LINKED_TASK_IDS.has(input.taskId)
    && typeof input.day === "string" && ISO_DAY.test(input.day)
    ? { taskId: input.taskId, day: input.day }
    : null;
}

export function announceLinkedDailyAction(value: unknown): void {
  const detail = linkedDailyAction(value);
  if (detail && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<LinkedDailyAction>(LINKED_DAILY_ACTION_EVENT, { detail }));
  }
}
