import type { MemberRecord } from "./family-members";

export function pregnancyMemoryGroups(records: MemberRecord[]) {
  const groups = new Map<string, { key: string; dueDate: string; week: number; records: MemberRecord[]; mediaIds: string[] }>();
  for (const record of records) {
    const memory = record.pregnancyMemory;
    if (!memory || record.deleted) continue;
    const key = `${memory.dueDate}:${memory.week}`;
    const group = groups.get(key) ?? { key, dueDate: memory.dueDate, week: memory.week, records: [], mediaIds: [] };
    group.records.push(record); group.mediaIds = [...new Set([...group.mediaIds, ...memory.mediaIds])]; groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.dueDate.localeCompare(a.dueDate) || a.week - b.week);
}
