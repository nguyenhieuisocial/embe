export type PhotoAuthor = "father" | "mother";

type SendPhotoInput = {
  authorRole: PhotoAuthor;
  caption: string;
  file: File;
  idempotencyKey: string;
  onProgress?: (percent: number) => void;
};

export async function sendFamilyPhoto(input: SendPhotoInput): Promise<{ uploadId: string }> {
  const created = await fetch("/api/photo-uploads", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      authorRole: input.authorRole,
      byteSize: input.file.size,
      caption: input.caption,
      capturedAt: new Date(input.file.lastModified || Date.now()).toISOString(),
      filename: input.file.name || "anh-moi.jpg",
      idempotencyKey: input.idempotencyKey,
      mimeType: input.file.type
    })
  });
  if (!created.ok) throw new Error(created.status === 400 ? "invalid_photo" : "create_failed");
  const session = await created.json() as { uploadId?: string; uploadUrl?: string };
  if (!session.uploadId || !session.uploadUrl) throw new Error("create_failed");
  input.onProgress?.(15);

  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", input.file);
  const uploaded = await fetch(session.uploadUrl, {
    method: "PUT",
    headers: { "x-upsert": "false" },
    body: form
  });
  if (!uploaded.ok) throw new Error("upload_failed");
  input.onProgress?.(82);

  const completed = await fetch(`/api/photo-uploads/${session.uploadId}/complete`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  if (!completed.ok) throw new Error("complete_failed");
  input.onProgress?.(100);
  return { uploadId: session.uploadId };
}
