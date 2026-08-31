export const OWNER_ROLES = ["mother", "father", "family"] as const;
export const TASK_CATEGORIES = ["general", "pregnancy", "meal", "health", "inventory", "journal", "memory", "appointment"] as const;
export const LINK_TARGETS = ["none", "pregnancy", "meal", "health", "inventory", "journal", "memory", "calendar", "assistant"] as const;
export const REPEAT_RULES = ["none", "daily", "weekly"] as const;

export type OwnerRole = typeof OWNER_ROLES[number];
export type TaskCategory = typeof TASK_CATEGORIES[number];
export type LinkTarget = typeof LINK_TARGETS[number];
export type RepeatRule = typeof REPEAT_RULES[number];

export type FamilyTask = {
  id: string;
  occurrenceOn: string;
  startsOn: string;
  title: string;
  note: string;
  ownerRole: OwnerRole;
  category: TaskCategory;
  linkTarget: LinkTarget;
  dueTime: string | null;
  repeatRule: RepeatRule;
  completed: boolean;
};

export const LINK_DETAILS: Record<LinkTarget, { href: string; label: string }> = {
  none: { href: "", label: "" },
  pregnancy: { href: "/me-bau", label: "Mẹ bầu" },
  meal: { href: "/me-bau#meal-photo-title", label: "Bữa ăn" },
  health: { href: "/me-bau#health-title", label: "Sức khỏe" },
  inventory: { href: "/do-dung", label: "Đồ dùng" },
  journal: { href: "/ghi-lai#viet-nhat-ky", label: "Nhật ký" },
  memory: { href: "/ky-niem", label: "Kỷ niệm" },
  calendar: { href: "/lich", label: "Lịch" },
  assistant: { href: "/tro-ly", label: "Trợ lý" }
};

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  const year = Number(value.slice(0, 4));
  return year >= 2020 && year <= 2100 && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isTaskId(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9]\d{0,18}$/.test(value)) return false;
  try { return BigInt(value) <= 9_223_372_036_854_775_807n; } catch { return false; }
}

export function dateInVietnam(value = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(value);
}
