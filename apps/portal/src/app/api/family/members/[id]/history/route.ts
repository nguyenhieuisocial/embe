import { UUID, validFamilyMember, validMemberRecord } from "../../../../../../lib/family-members";
import { memberAuthorization, memberFailure, memberRpc } from "../../../../../../lib/family-members-server";
import { privateReply } from "../../../../../../lib/photo-upload-server";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const denied = await memberAuthorization(request); if (denied) return denied;
  const { id } = await context.params;
  if (!UUID.test(id)) return memberFailure(400);
  const result = await memberRpc("embe_member_change_history", { p_member_id: id });
  if (result.status !== 200) return memberFailure(result.status);
  if (!Array.isArray(result.data) || result.data.length > 50 || !result.data.every(row =>
    row && typeof row.changed_at === "string" && (row.entity_type === "profile" ? validFamilyMember(row.snapshot) && row.snapshot.id === id
      : row.entity_type === "record" && validMemberRecord(row.snapshot) && row.snapshot.memberId === id))) return memberFailure(503);
  return privateReply({ history: result.data.map(row => ({ id: row.id, kind: row.entity_type, revision: row.revision, changedAt: row.changed_at, snapshot: row.snapshot })) }, 200);
}
