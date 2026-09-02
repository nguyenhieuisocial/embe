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
      hasHealthEntry: false,
      hasMealEntry: false,
      profileComplete: true
    });

    expect(priorities[0]).toMatchObject({ kind: "task", title: "Gọi phòng khám" });
  });

  it("keeps the next appointment visible when today is otherwise quiet", () => {
    const priorities = selectTodayPriorities({
      now: "2026-09-02T07:00:00+07:00", today, carePlans: [], hasHealthEntry: true,
      hasMealEntry: true, profileComplete: true,
      tasks: [{ id: "4", occurrenceOn: "2026-09-05", startsOn: "2026-09-05", title: "Siêu âm", note: "", ownerRole: "family", category: "appointment", linkTarget: "calendar", dueTime: "09:30", repeatRule: "none", completed: false }]
    });
    expect(priorities[0]).toMatchObject({ kind: "appointment", title: "Siêu âm", detail: "05/09 · 09:30" });
  });
});
