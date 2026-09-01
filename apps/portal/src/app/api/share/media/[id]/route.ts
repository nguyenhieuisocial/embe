import { getMediaMemory } from "../../../../../lib/media";
import { authorizeMutation, privateReply } from "../../../../../lib/photo-upload-server";
import { createMediaShareToken, MEDIA_SHARE_TTL_MS } from "../../../../../lib/share-token";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const { id } = await context.params;
  const memory = await getMediaMemory(id);
  if (!memory) return privateReply({ error: "not_found" }, 404);
  try {
    const now = new Date();
    const token = createMediaShareToken(memory.id, now);
    return privateReply({
      path: `/chia-se/${token}`,
      expiresAt: new Date(now.getTime() + MEDIA_SHARE_TTL_MS).toISOString()
    }, 201);
  } catch {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
}
