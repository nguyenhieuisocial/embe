import { UUID, validMemberRecord } from "../../../../../../lib/family-members";
import { memberAuthorization, memberBody, memberFailure, memberRpc } from "../../../../../../lib/family-members-server";
import { privateReply } from "../../../../../../lib/photo-upload-server";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context): Promise<Response> {
  const denied = await memberAuthorization(request); if (denied) return denied;
  const { id } = await context.params;
  const query = new URL(request.url).searchParams;
  const offsetText = query.get("offset") ?? "0";
  const offset = Number(offsetText);
  if (!UUID.test(id) || !/^\d+$/.test(offsetText) || offset > 1000000 || (query.has("deleted") && !["true", "false"].includes(query.get("deleted")!))) return memberFailure(400);
  const result = await memberRpc("embe_list_member_records", { p_member_id: id, p_offset: offset, p_deleted: query.get("deleted") === "true" });
  if (result.status !== 200) return memberFailure(result.status);
  const records = (result.data as { records?: unknown })?.records;
  const latest = (result.data as { latest?: unknown })?.latest;
  if (!Array.isArray(latest) || latest.length > 100 || !latest.every(r => validMemberRecord(r) && r.memberId === id && !r.deleted && r.kind === "measurement")) return memberFailure(503);
  if (!Array.isArray(records) || records.length > 41 || !records.every(r => validMemberRecord(r) && r.memberId === id)) return memberFailure(503);
  return privateReply({ records: records.slice(0, 40), latest, nextOffset: records.length > 40 ? offset + 40 : null }, 200);
}
export async function POST(request: Request, context: Context): Promise<Response> {
  const denied = await memberAuthorization(request, true); if (denied) return denied;
  const { id } = await context.params;
  if (!UUID.test(id)) return memberFailure(400);
  let value: unknown;
  try { value = await memberBody(request); } catch (error) {
    return privateReply({ error: "invalid_request" }, error instanceof Error && error.message === "too_large" ? 413 : 400);
  }
  if (!validMemberRecord(value) || value.memberId !== id) return memberFailure(400);
  const result = await memberRpc("embe_save_member_record", { p_member_id: id, p_id: value.id, p_revision: value.revision, p_record: value });
  return result.status === 200 && validMemberRecord(result.data) && result.data.memberId === id
    ? privateReply({ record: result.data }, 200) : memberFailure(result.status === 200 ? 503 : result.status);
}
