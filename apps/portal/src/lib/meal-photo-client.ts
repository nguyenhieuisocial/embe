import type { MealAnalysis } from "./meal-analysis-contract";

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("invalid_image")); };
    image.src = url;
  });
}

export async function prepareMealPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 1) throw new Error("invalid_image");
  const image = await loadImage(file);
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("invalid_image");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob || blob.size > 12_000_000) throw new Error("image_too_large");
  return new File([blob], "bua-an.jpg", { type: "image/jpeg", lastModified: file.lastModified || Date.now() });
}

export async function createMealDraft(input: {
  authorRole: "father" | "mother";
  file: File;
  mealType: string;
  note: string;
}): Promise<string> {
  const file = await prepareMealPhoto(input.file);
  const idempotencyKey = crypto.randomUUID();
  const created = await fetch("/api/meals", {
    method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      authorRole: input.authorRole, byteSize: file.size, eatenAt: new Date().toISOString(),
      filename: file.name, idempotencyKey, mealType: input.mealType, mimeType: file.type, note: input.note
    })
  });
  if (!created.ok) throw new Error("create_failed");
  const session = await created.json() as { entryId?: string; uploadUrl?: string };
  if (!session.entryId || !session.uploadUrl) throw new Error("create_failed");
  const form = new FormData(); form.append("cacheControl", "300"); form.append("", file);
  const uploaded = await fetch(session.uploadUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: form });
  if (!uploaded.ok) throw new Error("upload_failed");
  const completed = await fetch(`/api/meals/${session.entryId}/complete`, {
    method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}"
  });
  if (!completed.ok) throw new Error("complete_failed");
  return session.entryId;
}

export async function waitForMealDraft(entryId: string, attempts = 45): Promise<{ analysis: MealAnalysis; note: string }> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`/api/meals/${entryId}`, { cache: "no-store" });
    if (!response.ok) throw new Error("analysis_failed");
    const value = await response.json() as { status?: string; analysis?: MealAnalysis; note?: string };
    if (value.status === "review" && value.analysis) return { analysis: value.analysis, note: value.note ?? "" };
    if (value.status === "rejected") throw new Error("analysis_failed");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("analysis_timeout");
}

export async function waitForMealNutrition(entryId: string, attempts = 60): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`/api/meals/${entryId}`, { cache: "no-store" });
    if (!response.ok) return;
    const value = await response.json() as { status?: string };
    if (value.status === "confirmed" || value.status === "deleted" || value.status === "rejected") return;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
