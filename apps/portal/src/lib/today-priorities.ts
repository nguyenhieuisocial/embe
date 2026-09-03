import type { FamilyTask } from "./family-task-contract";

export type TodayCarePlan = {
  id: string;
  name: string;
  active: boolean;
  reminderTimes: string[];
  takenSlots: number[];
};

export type TodayInventoryItem = {
  productId: number;
  name: string;
  quantity: number;
  unit: string;
  minQuantity: number;
};

export type TodayPriority = {
  id: string;
  kind: "appointment" | "task" | "medicine" | "health" | "meal" | "profile" | "inventory";
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
};

export type TodayPriorityInput = {
  now: string;
  today: string;
  tasks: FamilyTask[];
  carePlans: TodayCarePlan[];
  inventoryItems: TodayInventoryItem[];
  hasHealthEntry: boolean | null;
  hasMealEntry: boolean | null;
  profileComplete: boolean | null;
};

type RankedPriority = TodayPriority & { rank: number; order: string };

function taskHref(task: FamilyTask): string {
  if (task.category === "appointment") return "/lich";
  if (task.linkTarget === "health") return "/me-bau#suc-khoe";
  if (task.linkTarget === "meal") return "/me-bau#bua-an";
  if (task.linkTarget === "inventory") return "/do-dung";
  return "/ke-hoach";
}

function localTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "00:00";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(parsed);
}

export function selectTodayPriorities(input: TodayPriorityInput): TodayPriority[] {
  const candidates: RankedPriority[] = [];

  for (const task of input.tasks) {
    if (task.completed || (task.occurrenceOn > input.today && task.category !== "appointment")) continue;
    const overdue = task.occurrenceOn < input.today;
    const appointment = task.category === "appointment";
    const upcoming = task.occurrenceOn > input.today;
    const appointmentDay = upcoming ? `${task.occurrenceOn.slice(8, 10)}/${task.occurrenceOn.slice(5, 7)}` : "";
    candidates.push({
      id: `task:${task.id}`,
      kind: appointment ? "appointment" : "task",
      title: task.title,
      detail: overdue ? "Đã qua hạn" : upcoming
        ? `${appointmentDay}${task.dueTime ? ` · ${task.dueTime}` : ""}`
        : task.dueTime ?? "Hôm nay",
      href: taskHref(task),
      actionLabel: appointment ? "Mở lịch" : "Mở việc",
      rank: appointment ? (upcoming ? 25 : 0) : overdue ? 5 : 30,
      order: `${task.occurrenceOn}:${task.dueTime ?? "99:99"}`
    });
  }

  const nowTime = localTime(input.now);
  for (const plan of input.carePlans) {
    if (!plan.active) continue;
    const slot = plan.reminderTimes.findIndex((_, index) => !plan.takenSlots.includes(index + 1));
    if (slot < 0) continue;
    const reminderTime = plan.reminderTimes[slot] ?? "";
    candidates.push({
      id: `medicine:${plan.id}:${slot + 1}`,
      kind: "medicine",
      title: plan.name,
      detail: reminderTime ? `${reminderTime}${reminderTime <= nowTime ? " · đến giờ" : ""}` : "Theo kế hoạch hôm nay",
      href: "/me-bau#vi-chat-thuoc",
      actionLabel: "Ghi đã dùng",
      rank: 10,
      order: reminderTime || "99:99"
    });
  }

  if (input.hasHealthEntry === false) candidates.push({
    id: "health:today", kind: "health", title: "Ghi sức khỏe", detail: "Một check-in ngắn cho Mẹ Ngân",
    href: "/me-bau#suc-khoe", actionLabel: "Ghi nhanh", rank: 20, order: ""
  });
  if (input.inventoryItems.length) {
    const first = input.inventoryItems[0];
    const remaining = input.inventoryItems.length - 1;
    candidates.push({
      id: `inventory:${first.productId}`,
      kind: "inventory",
      title: remaining ? `${first.name} và ${remaining} món khác` : `${first.name} sắp hết`,
      detail: remaining ? "Đều đang dưới mức nhắc" : `Còn ${first.quantity.toLocaleString("vi-VN")} ${first.unit} · nhắc ở ${first.minQuantity.toLocaleString("vi-VN")}`,
      href: "/do-dung",
      actionLabel: "Xem đồ dùng",
      rank: 35,
      order: first.name
    });
  }
  if (input.hasMealEntry === false) candidates.push({
    id: "meal:today", kind: "meal", title: "Ghi bữa ăn", detail: "Chụp ảnh hoặc chỉ ghi chú",
    href: "/me-bau#bua-an", actionLabel: "Ghi bữa", rank: 40, order: ""
  });
  if (input.profileComplete === false) candidates.push({
    id: "profile:pregnancy", kind: "profile", title: "Hoàn thiện hồ sơ thai kỳ",
    detail: "Ngày dự sinh và nơi khám", href: "/me-bau/ho-so", actionLabel: "Mở hồ sơ", rank: 50, order: ""
  });

  return candidates
    .sort((left, right) => left.rank - right.rank || left.order.localeCompare(right.order))
    .slice(0, 3)
    .map(({ rank: _rank, order: _order, ...priority }) => priority);
}
