import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionCookie } from "../src/lib/portal-auth";

const rpc = vi.fn();
const createSignedUploadUrl = vi.fn();
const info = vi.fn();
const download = vi.fn();
const revalidateFamilyViews = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc, storage: { from: () => ({ createSignedUploadUrl, info, download }) } })
}));
vi.mock("../src/lib/family-view-revalidation", () => ({ revalidateFamilyViews }));

import { GET as listRecords, POST as saveRecord } from "../src/app/api/pregnancy/records/route";
import { DELETE as deleteRecord } from "../src/app/api/pregnancy/records/[id]/route";
import { POST as createDocument } from "../src/app/api/pregnancy/records/[id]/documents/route";
import { GET as viewDocument, POST as completeDocument } from "../src/app/api/pregnancy/documents/[id]/route";
import {
  GET as getMedicationScan,
  PATCH as confirmMedicationScan,
  POST as queueMedicationScan
} from "../src/app/api/pregnancy/documents/[id]/medication-scan/route";

const originalEnvironment = { ...process.env };
const recordId = "11111111-1111-4111-8111-111111111111";
const documentId = "22222222-2222-4222-8222-222222222222";
function cookie() { return `embe_session=${createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111")}`; }
function request(url: string, method = "GET", body?: unknown, authenticated = true) {
  return new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: {
    ...(body === undefined ? {} : { "content-type": "application/json" }),
    ...(method === "GET" ? {} : { origin: "https://embe.hieu.asia" }), ...(authenticated ? { cookie: cookie() } : {})
  } });
}

const recordInput = {
  id: null, kind: "appointment", status: "planned", occurredAt: "2026-09-10T02:30:00.000Z",
  title: "Khám thai định kỳ", provider: "Bệnh viện", clinician: "", notes: "Mang kết quả cũ",
  gestationalWeek: 10, nextAppointmentAt: null, measurements: {}, medicines: []
};

describe("private pregnancy medical records", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-key";
    rpc.mockReset(); createSignedUploadUrl.mockReset(); info.mockReset(); download.mockReset();
    revalidateFamilyViews.mockClear();
  });
  afterEach(() => { process.env = { ...originalEnvironment }; });

  it("requires the family session and stores a planned appointment atomically", async () => {
    expect((await listRecords(request("https://embe.hieu.asia/api/pregnancy/records", "GET", undefined, false))).status).toBe(401);
    rpc.mockResolvedValueOnce({ data: recordId, error: null });
    const response = await saveRecord(request("https://embe.hieu.asia/api/pregnancy/records", "POST", recordInput));
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("embe_save_pregnancy_medical_record_with_task", expect.objectContaining({
      p_kind: "appointment", p_status: "planned", p_occurred_at: "2026-09-10T02:30:00.000Z"
    }));
  });

  it("deletes a medical record and its planner task atomically", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const response = await deleteRecord(
      request(`https://embe.hieu.asia/api/pregnancy/records/${recordId}`, "DELETE"),
      { params: Promise.resolve({ id: recordId }) }
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("embe_delete_pregnancy_medical_record_with_task", { p_id: recordId });
  });

  it("classifies records and returns only cautious preparation insights", async () => {
    rpc.mockResolvedValueOnce({ data: [{
      id: recordId, kind: "prescription", status: "completed", occurred_at: "2026-09-01T02:00:00Z",
      title: "Đơn thuốc", provider: "", clinician: "", notes: "Theo đúng đơn", gestational_week: 9,
      next_appointment_at: null, measurements: {}, medicines: [{ name: "Thuốc A", dose: "1 viên", frequency: "mỗi ngày", instructions: "" }], documents: []
    }], error: null });
    const response = await listRecords(request("https://embe.hieu.asia/api/pregnancy/records"));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.records[0].medicines[0].name).toBe("Thuốc A");
    expect(payload.insights.questions[0]).toContain("ngày hẹn tiếp theo");
    expect(payload.notice).toContain("không đọc kết quả thay bác sĩ");
  });

  it("keeps images and PDFs private, verifies the stored object, then proxies it", async () => {
    const path = `records/${recordId}/${documentId}.pdf`;
    rpc.mockResolvedValueOnce({ data: { id: documentId, storage_path: path }, error: null });
    createSignedUploadUrl.mockResolvedValueOnce({ data: { signedUrl: "https://project.supabase.co/upload?token=short" }, error: null });
    const created = await createDocument(request(`https://embe.hieu.asia/api/pregnancy/records/${recordId}/documents`, "POST", {
      documentId, filename: "don-thuoc.pdf", mimeType: "application/pdf", byteSize: 1234
    }), { params: Promise.resolve({ id: recordId }) });
    expect(created.status).toBe(201);

    rpc.mockResolvedValueOnce({ data: { storage_path: path, mime_type: "application/pdf", byte_size: 1234, status: "pending" }, error: null });
    info.mockResolvedValueOnce({ data: { size: 1234, contentType: "application/pdf" }, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const completed = await completeDocument(request(`https://embe.hieu.asia/api/pregnancy/documents/${documentId}`, "POST", {}), { params: Promise.resolve({ id: documentId }) });
    expect(completed.status).toBe(202);

    rpc.mockResolvedValueOnce({ data: { storage_path: path, mime_type: "application/pdf", original_filename: "don-thuoc.pdf", status: "ready" }, error: null });
    download.mockResolvedValueOnce({ data: await new Response("private-pdf").blob(), error: null });
    const viewed = await viewDocument(request(`https://embe.hieu.asia/api/pregnancy/documents/${documentId}`), { params: Promise.resolve({ id: documentId }) });
    expect(viewed.status).toBe(200);
    expect(viewed.headers.get("cache-control")).toBe("private, no-store");
    expect(viewed.headers.get("content-type")).toBe("application/pdf");
  });

  it("queues and returns a private medication transcription without storage details", async () => {
    rpc.mockResolvedValueOnce({ data: { document_id: documentId, status: "queued" }, error: null });
    const queued = await queueMedicationScan(
      request(`https://embe.hieu.asia/api/pregnancy/documents/${documentId}/medication-scan`, "POST", {}),
      { params: Promise.resolve({ id: documentId }) }
    );
    expect(queued.status).toBe(202);
    expect(rpc).toHaveBeenLastCalledWith("embe_queue_medication_scan", { p_document_id: documentId });

    rpc.mockResolvedValueOnce({ data: {
      document_id: documentId, status: "review", analysis: {
        medicines: [{ name: "Sắt", dose: "1 viên", frequency: "mỗi ngày", instructions: "Sau ăn", confidence: 0.83 }],
        questions: ["Kiểm tra lại hàm lượng trên nhãn."]
      }
    }, error: null });
    const viewed = await getMedicationScan(
      request(`https://embe.hieu.asia/api/pregnancy/documents/${documentId}/medication-scan`),
      { params: Promise.resolve({ id: documentId }) }
    );
    const payload = await viewed.json();
    expect(viewed.status).toBe(200);
    expect(payload.analysis.medicines[0].name).toBe("Sắt");
    expect(JSON.stringify(payload)).not.toContain("storage_path");
  });

  it("requires explicit confirmation and rejects prescribing fields", async () => {
    const invalid = await confirmMedicationScan(
      request(`https://embe.hieu.asia/api/pregnancy/documents/${documentId}/medication-scan`, "PATCH", {
        medicines: [{ name: "Thuốc A", dose: "1 viên", frequency: "mỗi ngày", instructions: "", safeInPregnancy: true }]
      }), { params: Promise.resolve({ id: documentId }) }
    );
    expect(invalid.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockResolvedValueOnce({ data: null, error: null });
    const confirmed = await confirmMedicationScan(
      request(`https://embe.hieu.asia/api/pregnancy/documents/${documentId}/medication-scan`, "PATCH", {
        medicines: [{ name: "Thuốc A", dose: "1 viên", frequency: "mỗi ngày", instructions: "Sau ăn" }]
      }), { params: Promise.resolve({ id: documentId }) }
    );
    expect(confirmed.status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("embe_confirm_medication_scan", {
      p_confirmed_analysis: { medicines: [{ name: "Thuốc A", dose: "1 viên", frequency: "mỗi ngày", instructions: "Sau ăn" }] },
      p_document_id: documentId
    });
  });

  it("requires family authentication for medication scans", async () => {
    const response = await getMedicationScan(
      request(`https://embe.hieu.asia/api/pregnancy/documents/${documentId}/medication-scan`, "GET", undefined, false),
      { params: Promise.resolve({ id: documentId }) }
    );
    expect(response.status).toBe(401);
  });
});
