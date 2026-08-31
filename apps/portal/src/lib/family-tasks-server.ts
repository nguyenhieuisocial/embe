import type { FamilyTask } from "./family-task-contract";
import { isIsoDate, isTaskId, LINK_TARGETS, OWNER_ROLES, REPEAT_RULES, TASK_CATEGORIES } from "./family-task-contract";

const owners = new Set<string>(OWNER_ROLES);
const categories = new Set<string>(TASK_CATEGORIES);
const links = new Set<string>(LINK_TARGETS);
const repeats = new Set<string>(REPEAT_RULES);

function normalizeTask(value: unknown): FamilyTask | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!isTaskId(row.id) || !isIsoDate(row.occurrence_on) || !isIsoDate(row.starts_on)
      || typeof row.title !== "string" || row.title.length < 1 || row.title.length > 120
      || typeof row.note !== "string" || row.note.length > 500
      || typeof row.owner_role !== "string" || !owners.has(row.owner_role)
      || typeof row.category !== "string" || !categories.has(row.category)
      || typeof row.link_target !== "string" || !links.has(row.link_target)
      || (row.due_time !== null && (typeof row.due_time !== "string" || !/^\d{2}:\d{2}$/.test(row.due_time)))
      || typeof row.repeat_rule !== "string" || !repeats.has(row.repeat_rule)
      || typeof row.completed !== "boolean") return null;
  return {
    id: row.id, occurrenceOn: row.occurrence_on, startsOn: row.starts_on, title: row.title, note: row.note,
    ownerRole: row.owner_role as FamilyTask["ownerRole"], category: row.category as FamilyTask["category"],
    linkTarget: row.link_target as FamilyTask["linkTarget"], dueTime: row.due_time as string | null,
    repeatRule: row.repeat_rule as FamilyTask["repeatRule"], completed: row.completed
  };
}

export async function taskRpc(name: string, body: Record<string, unknown>): Promise<unknown> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("task store unavailable");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("invalid task store");
  const response = await fetch(`${parsed.origin}/rest/v1/rpc/${name}`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error("task store request failed");
  return response.json();
}

export async function getFamilyTasks(from: string, to: string): Promise<FamilyTask[]> {
  const data = await taskRpc("embe_list_family_tasks", { p_from: from, p_to: to });
  if (!Array.isArray(data)) throw new Error("invalid task list");
  return data.map(normalizeTask).filter((task): task is FamilyTask => task !== null);
}
