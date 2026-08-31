import {
  authorizeMutation, isUuidV4, photoStore, privateReply
} from "../../../../../lib/photo-upload-server";

const REACTIONS = new Set(["heart", "love", "laugh", "moved"]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const { id } = await context.params;
  if (!isUuidV4(id)) return privateReply({ error: "invalid_request" }, 400);

  let input: unknown;
  try { input = await request.json(); } catch { return privateReply({ error: "invalid_request" }, 400); }
  if (!input || typeof input !== "object") return privateReply({ error: "invalid_request" }, 400);
  const value = input as Record<string, unknown>;
  if ((value.authorRole !== "father" && value.authorRole !== "mother") || typeof value.emoji !== "string" || !REACTIONS.has(value.emoji)) {
    return privateReply({ error: "invalid_request" }, 400);
  }

  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  try {
    const result = await store.rpc("embe_react_media", {
      p_author_role: value.authorRole,
      p_emoji: value.emoji,
      p_media_item_id: id
    });
    if (result.error || !result.data || typeof result.data !== "object") throw new Error("reaction failed");
    return privateReply({ reactions: result.data }, 200);
  } catch {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
}
