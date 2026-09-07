import { validFamilyMember } from "../../../../lib/family-members";
import { memberAuthorization, memberBody, memberFailure, memberRpc } from "../../../../lib/family-members-server";
import { privateReply } from "../../../../lib/photo-upload-server";

export async function GET(request: Request): Promise<Response> {
  const denied = await memberAuthorization(request); if (denied) return denied;
  const result = await memberRpc("embe_list_family_members");
  if (result.status !== 200) return memberFailure(result.status);
  return Array.isArray(result.data) && result.data.every(validFamilyMember)
    ? privateReply({ members: result.data }, 200) : memberFailure(503);
}
export async function POST(request: Request): Promise<Response> {
  const denied = await memberAuthorization(request, true); if (denied) return denied;
  let value: unknown;
  try { value = await memberBody(request); } catch (error) {
    return privateReply({ error: "invalid_request" }, error instanceof Error && error.message === "too_large" ? 413 : 400);
  }
  if (!validFamilyMember(value)) return memberFailure(400);
  const result = await memberRpc("embe_save_family_member", { p_id: value.id, p_revision: value.revision, p_profile: value });
  return result.status === 200 && validFamilyMember(result.data)
    ? privateReply({ member: result.data }, 200) : memberFailure(result.status === 200 ? 503 : result.status);
}
