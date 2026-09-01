import { authorizeMutation, isUuidV4, photoStore, privateReply } from "../../../../../../lib/photo-upload-server";
import { MEDICAL_BUCKET, MEDICAL_MAX_BYTES, MEDICAL_MIME_TYPES } from "../../../../../../lib/pregnancy-medical";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const { id } = await context.params;
  let input: unknown; try { input = await request.json(); } catch { return privateReply({ error: "invalid_request" }, 400); }
  if (!isUuidV4(id) || !input || typeof input !== "object") return privateReply({ error: "invalid_request" }, 400);
  const value = input as Record<string, unknown>;
  if (!isUuidV4(value.documentId) || typeof value.filename !== "string" || !value.filename.trim() || value.filename.length > 180
      || typeof value.mimeType !== "string" || !MEDICAL_MIME_TYPES.has(value.mimeType)
      || !Number.isSafeInteger(value.byteSize) || Number(value.byteSize) < 1 || Number(value.byteSize) > MEDICAL_MAX_BYTES) {
    return privateReply({ error: "invalid_request" }, 400);
  }
  const store = photoStore(); if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  try {
    const created = await store.rpc("embe_create_pregnancy_medical_document", {
      p_record_id: id, p_document_id: value.documentId, p_original_filename: value.filename,
      p_mime_type: value.mimeType, p_byte_size: value.byteSize
    });
    const document = created.data as Record<string, unknown> | null;
    if (created.error || !document || typeof document.storage_path !== "string") throw new Error("create unavailable");
    const signed = await store.storage.from(MEDICAL_BUCKET).createSignedUploadUrl(document.storage_path, { upsert: false });
    if (signed.error || !signed.data?.signedUrl) throw new Error("sign unavailable");
    return privateReply({ documentId: value.documentId, uploadUrl: signed.data.signedUrl }, 201);
  } catch { return privateReply({ error: "temporarily_unavailable" }, 503); }
}
