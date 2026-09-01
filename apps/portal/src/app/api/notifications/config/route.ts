import { privateReply } from "../../../../lib/photo-upload-server";
import { familySessionAuthorized } from "../../../../lib/push-notification-server";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  if (!familySessionAuthorized(request)) return privateReply({ error: "unauthorized" }, 401);
  const publicKey = process.env.EMBE_VAPID_PUBLIC_KEY;
  return publicKey ? privateReply({ publicKey }, 200) : privateReply({ error: "temporarily_unavailable" }, 503);
}
