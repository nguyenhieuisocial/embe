import {
  confirmedMedicationPayload, MEDICATION_SCAN_STATUSES, normalizeMedicationScanAnalysis
} from "../../../../../../lib/medication-scan-contract";
import { authorizeMutation, isUuidV4, photoStore, privateReply } from "../../../../../../lib/photo-upload-server";
import { verifySessionCookie } from "../../../../../../lib/portal-auth";
import { revalidateFamilyViews } from "../../../../../../lib/family-view-revalidation";

type Context = { params: Promise<{ id: string }> };

function session(request: Request): boolean {
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === "embe_session")?.slice(1).join("=");
  return Boolean(process.env.EMBE_PORTAL_SESSION_SECRET
    && verifySessionCookie(cookie, process.env.EMBE_PORTAL_SESSION_SECRET));
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const { id } = await context.params;
  if (!isUuidV4(id)) return privateReply({ error: "invalid_request" }, 400);
  let input: unknown;
  try { input = await request.json(); } catch { return privateReply({ error: "invalid_request" }, 400); }
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) {
    return privateReply({ error: "invalid_request" }, 400);
  }
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  try {
    const result = await store.rpc("embe_queue_medication_scan", { p_document_id: id });
    const value = result.data as Record<string, unknown> | null;
    if (result.error || !value || !MEDICATION_SCAN_STATUSES.has(String(value.status))) throw new Error("queue unavailable");
    return privateReply({ status: value.status }, value.status === "confirmed" || value.status === "review" ? 200 : 202);
  } catch {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
}

export async function GET(request: Request, context: Context): Promise<Response> {
  if (!session(request)) return privateReply({ error: "unauthorized" }, 401);
  const { id } = await context.params;
  if (!isUuidV4(id)) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  try {
    const result = await store.rpc("embe_get_medication_scan", { p_document_id: id });
    const value = result.data as Record<string, unknown> | null;
    if (result.error || !value) return privateReply({ error: "not_found" }, 404);
    const status = String(value.status);
    if (!MEDICATION_SCAN_STATUSES.has(status)) throw new Error("invalid scan status");
    const source = status === "confirmed" ? value.confirmed_analysis : value.analysis;
    const analysis = source === null || source === undefined ? null : normalizeMedicationScanAnalysis(source);
    if (source !== null && source !== undefined && !analysis) throw new Error("invalid scan result");
    return privateReply({ documentId: id, status, ...(analysis ? { analysis } : {}) }, 200);
  } catch {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const { id } = await context.params;
  if (!isUuidV4(id)) return privateReply({ error: "invalid_request" }, 400);
  let input: unknown;
  try { input = await request.json(); } catch { return privateReply({ error: "invalid_request" }, 400); }
  const confirmed = confirmedMedicationPayload(input);
  if (!confirmed) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  try {
    const result = await store.rpc("embe_confirm_medication_scan", {
      p_confirmed_analysis: confirmed,
      p_document_id: id
    });
    if (result.error) throw new Error("confirmation unavailable");
    revalidateFamilyViews();
    return privateReply({ status: "confirmed" }, 200);
  } catch {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
}
