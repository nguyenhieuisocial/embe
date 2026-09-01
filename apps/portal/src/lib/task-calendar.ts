import type { FamilyTask } from "./family-task-contract";

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function compactDate(day: string): string {
  return day.replaceAll("-", "");
}

function utcStamp(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function taskCalendarFilename(task: FamilyTask): string {
  const safe = task.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 48) || "lich-hen";
  return `${task.occurrenceOn}-${safe}.ics`;
}

export function familyTaskToIcs(task: FamilyTask, generatedAt = new Date()): string {
  const start = task.dueTime
    ? `DTSTART;TZID=Asia/Ho_Chi_Minh:${compactDate(task.occurrenceOn)}T${task.dueTime.replace(":", "")}00`
    : `DTSTART;VALUE=DATE:${compactDate(task.occurrenceOn)}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EmBe//Family Planner//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:embe-task-${task.id}-${task.occurrenceOn}@hieu.asia`,
    `DTSTAMP:${utcStamp(generatedAt)}`,
    start,
    `SUMMARY:${escapeIcs(task.title)}`,
    ...(task.note ? [`DESCRIPTION:${escapeIcs(task.note)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR"
  ];
  return `${lines.join("\r\n")}\r\n`;
}
