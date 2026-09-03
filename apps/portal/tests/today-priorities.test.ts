import { describe, expect, it } from "vitest";

import { selectTodayPriorities } from "../src/lib/today-priorities";

const today = "2026-09-02";

describe("smart priorities for Today", () => {
  it("keeps an appointment first and limits the screen to three useful actions", () => {
    const priorities = selectTodayPriorities({
      now: "2026-09-02T08:30:00+07:00",
      today,
      tasks: [
        { id: "1", occurrenceOn: today, startsOn: today, title: "Mua nước", note: "", ownerRole: "father", category: "general", linkTarget: "none", dueTime: "09:00", repeatRule: "none", completed: false },
        { id: "2", occurrenceOn: today, startsOn: today, title: "Khám thai", note: "Phòng khám", ownerRole: "family", category: "appointment", linkTarget: "calendar", dueTime: "10:00", repeatRule: "none", completed: false }
      ],
      carePlans: [{ id: "care-1", name: "Vi chất theo đơn", active: true, reminderTimes: ["08:00"], takenSlots: [] }],
      inventoryItems: [],
      hasHealthEntry: false,
      hasMealEntry: false,
      profileComplete: false
    });

    expect(priorities).toHaveLength(3);
    expect(priorities[0]).toMatchObject({ kind: "appointment", title: "Khám thai", href: "/lich" });
    expect(priorities.some((item) => item.kind === "medicine")).toBe(true);
    expect(priorities.some((item) => item.kind === "health")).toBe(true);
  });

  it("does not remind a dose that was already recorded", () => {
    const priorities = selectTodayPriorities({
      now: "2026-09-02T09:00:00+07:00",
      today,
      tasks: [],
      carePlans: [{ id: "care-1", name: "Vi chất theo đơn", active: true, reminderTimes: ["08:00"], takenSlots: [1] }],
      inventoryItems: [],
      hasHealthEntry: true,
      hasMealEntry: true,
      profileComplete: true
    });

    expect(priorities.some((item) => item.kind === "medicine")).toBe(false);
  });

  it("surfaces an overdue family task before a routine check-in", () => {
    const priorities = selectTodayPriorities({
      now: "2026-09-02T07:00:00+07:00",
      today,
      tasks: [{ id: "3", occurrenceOn: "2026-09-01", startsOn: "2026-09-01", title: "Gọi phòng khám", note: "", ownerRole: "father", category: "health", linkTarget: "health", dueTime: null, repeatRule: "none", completed: false }],
      carePlans: [],
      inventoryItems: [],
      hasHealthEntry: false,
      hasMealEntry: false,
      profileComplete: true
    });

    expect(priorities[0]).toMatchObject({ kind: "task", title: "Gọi phòng khám" });
  });

  it("keeps the next appointment visible when today is otherwise quiet", () => {
    const priorities = selectTodayPriorities({
      now: "2026-09-02T07:00:00+07:00", today, carePlans: [], hasHealthEntry: true,
      inventoryItems: [],
      hasMealEntry: true, profileComplete: true,
      tasks: [{ id: "4", occurrenceOn: "2026-09-05", startsOn: "2026-09-05", title: "Siêu âm", note: "", ownerRole: "family", category: "appointment", linkTarget: "calendar", dueTime: "09:30", repeatRule: "none", completed: false }]
    });
    expect(priorities[0]).toMatchObject({ kind: "appointment", title: "Siêu âm", detail: "05/09 · 09:30" });
  });

  it("surfaces genuinely low supplies before routine meal and profile prompts", () => {
    const priorities = selectTodayPriorities({
      now: "2026-09-02T07:00:00+07:00", today, tasks: [], carePlans: [],
      hasHealthEntry: true, hasMealEntry: false, profileComplete: false,
      inventoryItems: [{ productId: 12, name: "Bỉm sơ sinh", quantity: 7, unit: "cái", minQuantity: 10 }]
    });

    expect(priorities[0]).toEqual({
      id: "inventory:12", kind: "inventory", title: "Bỉm sơ sinh sắp hết",
      detail: "Còn 7 cái · nhắc ở 10", href: "/do-dung", actionLabel: "Xem đồ dùng"
    });
    expect(priorities.map((item) => item.kind)).toEqual(["inventory", "meal", "profile"]);
  });

  it("summarizes several low supplies without crowding the Today screen", () => {
    const priorities = selectTodayPriorities({
      now: "2026-09-02T07:00:00+07:00", today, tasks: [], carePlans: [],
      hasHealthEntry: true, hasMealEntry: true, profileComplete: true,
      inventoryItems: [
        { productId: 12, name: "Bỉm sơ sinh", quantity: 7, unit: "cái", minQuantity: 10 },
        { productId: 13, name: "Khăn ướt", quantity: 1, unit: "gói", minQuantity: 2 }
      ]
    });

    expect(priorities[0]).toMatchObject({
      id: "inventory:12", kind: "inventory", title: "Bỉm sơ sinh và 1 món khác", detail: "Đều đang dưới mức nhắc"
    });
  });
});
