import { describe, expect, it } from "vitest";

import type { FamilyTask } from "../src/lib/family-task-contract";
import { familyTaskToIcs, taskCalendarFilename } from "../src/lib/task-calendar";

const appointment: FamilyTask = {
  id: "12", occurrenceOn: "2026-09-03", startsOn: "2026-09-03",
  title: "Khám thai, lần 2", note: "Mang kết quả; hỏi bác sĩ\nvề thuốc",
  ownerRole: "family", category: "appointment", linkTarget: "pregnancy",
  dueTime: "09:30", repeatRule: "none", completed: false
};

describe("native calendar export", () => {
  it("creates a private iPhone-compatible calendar event in Vietnam time", () => {
    const value = familyTaskToIcs(appointment, new Date("2026-09-01T00:00:00Z"));
    expect(value).toContain("DTSTART;TZID=Asia/Ho_Chi_Minh:20260903T093000");
    expect(value).toContain("SUMMARY:Khám thai\\, lần 2");
    expect(value).toContain("DESCRIPTION:Mang kết quả\\; hỏi bác sĩ\\nvề thuốc");
    expect(value).toContain("UID:embe-task-12-2026-09-03@hieu.asia");
  });

  it("uses an all-day event and a safe Vietnamese filename when time is omitted", () => {
    const value = familyTaskToIcs({ ...appointment, dueTime: null });
    expect(value).toContain("DTSTART;VALUE=DATE:20260903");
    expect(taskCalendarFilename(appointment)).toBe("2026-09-03-kham-thai-lan-2.ics");
  });
});
