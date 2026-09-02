import { authorizeMutation, isUuidV4, photoStore, privateReply } from "../../../../../lib/photo-upload-server";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const { id } = await context.params;
  if (!isUuidV4(id)) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore(); if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  try {
    const result = await store.rpc("embe_delete_pregnancy_medical_record_with_task", { p_id: id });
    if (result.error) throw new Error("delete unavailable");
    return privateReply({ deleted: true }, 200);
  } catch { return privateReply({ error: "temporarily_unavailable" }, 503); }
}
