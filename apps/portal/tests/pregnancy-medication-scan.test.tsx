import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const prepareImageForUpload = vi.hoisted(() => vi.fn(async () =>
  new File(["prepared-image"], "tai-lieu-y-te.jpg", { type: "image/jpeg" })
));

vi.mock("../src/lib/image-preparation-client", () => ({ prepareImageForUpload }));

import PregnancyMedicalRecords from "../src/components/pregnancy-medical-records";

function recordsResponse() {
  return new Response(JSON.stringify({ records: [] }), { status: 200 });
}

describe("prescription image review", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("uploads an image, shows the original beside editable medicines, then confirms", async () => {
    window.history.replaceState({}, "", "/me-bau/ho-so?quick=prescription#ho-so-kham");
    let documentId = "";
    let confirmation: Record<string, unknown> | null = null;
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/pregnancy/records" && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }), { status: 201 });
      }
      if (url.includes("/records/11111111-1111-4111-8111-111111111111/documents") && init?.method === "POST") {
        documentId = String((JSON.parse(String(init.body)) as { documentId: string }).documentId);
        return new Response(JSON.stringify({ uploadUrl: "https://upload.test/prescription" }), { status: 201 });
      }
      if (url === "https://upload.test/prescription" && init?.method === "PUT") return new Response(null, { status: 200 });
      if (url.endsWith(`/pregnancy/documents/${documentId}`) && init?.method === "POST") {
        return new Response(JSON.stringify({ status: "ready" }), { status: 202 });
      }
      if (url.endsWith(`/pregnancy/documents/${documentId}/medication-scan`) && init?.method === "POST") {
        return new Response(JSON.stringify({ status: "queued" }), { status: 202 });
      }
      if (url.endsWith(`/pregnancy/documents/${documentId}/medication-scan`) && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ documentId, status: "review", analysis: {
          medicines: [{
            name: "Sắt cũ", ingredients: "Sắt nguyên tố 27 mg; axit folic 600 mcg",
            dose: "1 viên", frequency: "mỗi sáng", instructions: "Sau ăn", confidence: 0.84
          }],
          questions: ["Kiểm tra lại hàm lượng trên vỏ hộp."]
        } }), { status: 200 });
      }
      if (url.endsWith(`/pregnancy/documents/${documentId}/medication-scan`) && init?.method === "PATCH") {
        confirmation = JSON.parse(String(init.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ status: "confirmed" }), { status: 200 });
      }
      return recordsResponse();
    });
    vi.stubGlobal("fetch", fetch);

    render(<PregnancyMedicalRecords />);
    await screen.findByRole("heading", { name: "Thêm đơn thuốc" });
    fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Đơn thuốc 3/9" } });
    fireEvent.change(screen.getByLabelText(/Hồ sơ hoặc tài liệu mang theo/), {
      target: { files: [new File(["iphone-photo"], "IMG_0102.HEIC", { type: "image/heic" })] }
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu hồ sơ" }));

    const review = await screen.findByRole("article", { name: "Kiểm tra đơn thuốc từ ảnh" });
    expect(within(review).getByRole("img", { name: "Ảnh đơn thuốc gốc" })).toHaveAttribute(
      "src", `/api/pregnancy/documents/${documentId}`
    );
    expect(within(review).getByDisplayValue("Sắt cũ")).toBeInTheDocument();
    expect(within(review).getByDisplayValue("Sắt nguyên tố 27 mg; axit folic 600 mcg")).toBeInTheDocument();
    expect(within(review).getByText("Độ chắc chắn 84%")).toBeInTheDocument();
    expect(within(review).getByText("Kiểm tra lại hàm lượng trên vỏ hộp.")).toBeInTheDocument();

    fireEvent.change(within(review).getByLabelText("Tên thuốc"), { target: { value: "Sắt đã đối chiếu" } });
    fireEvent.click(within(review).getByRole("button", { name: "Xác nhận đúng theo đơn" }));
    await waitFor(() => expect(confirmation).toEqual({ medicines: [{
      name: "Sắt đã đối chiếu", ingredients: "Sắt nguyên tố 27 mg; axit folic 600 mcg",
      dose: "1 viên", frequency: "mỗi sáng", instructions: "Sau ăn"
    }] }));
    expect(within(review).getByText("Đã xác nhận")).toBeInTheDocument();
  });

  it("restores an unfinished scan from a saved prescription instead of showing only its image", async () => {
    const documentId = "22222222-2222-4222-8222-222222222222";
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/pregnancy/records") return new Response(JSON.stringify({ records: [{
        id: "11111111-1111-4111-8111-111111111111", kind: "prescription", status: "completed",
        occurredAt: "2026-09-04T01:00:00.000Z", title: "Vitamin thai kỳ", provider: "", clinician: "",
        notes: "", gestationalWeek: 10, nextAppointmentAt: null, measurements: {}, medicines: [],
        documents: [{ id: documentId, originalFilename: "thanh-phan.jpg", mimeType: "image/jpeg", byteSize: 2048, createdAt: "2026-09-04T01:00:00.000Z" }]
      }] }), { status: 200 });
      if (url.endsWith(`/pregnancy/documents/${documentId}/medication-scan`)) {
        return new Response(JSON.stringify({ documentId, status: "review", analysis: {
          medicines: [{
            name: "Elevit", ingredients: "Sắt 60 mg; axit folic 800 mcg",
            dose: "", frequency: "", instructions: "", confidence: 0.93
          }], questions: []
        } }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetch);

    render(<PregnancyMedicalRecords />);

    const review = await screen.findByRole("article", { name: "Kiểm tra đơn thuốc từ ảnh" });
    expect(within(review).getByDisplayValue("Elevit")).toBeInTheDocument();
    expect(within(review).getByDisplayValue("Sắt 60 mg; axit folic 800 mcg")).toBeInTheDocument();
  });

  it("stores a PDF prescription without sending it to image recognition", async () => {
    window.history.replaceState({}, "", "/me-bau/ho-so?quick=prescription#ho-so-kham");
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/pregnancy/records" && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }), { status: 201 });
      }
      if (url.includes("/records/11111111-1111-4111-8111-111111111111/documents") && init?.method === "POST") {
        return new Response(JSON.stringify({ uploadUrl: "https://upload.test/prescription.pdf" }), { status: 201 });
      }
      if (url === "https://upload.test/prescription.pdf" && init?.method === "PUT") return new Response(null, { status: 200 });
      if (/\/api\/pregnancy\/documents\/.+/.test(url) && init?.method === "POST") {
        return new Response(JSON.stringify({ status: "ready" }), { status: 202 });
      }
      return recordsResponse();
    });
    vi.stubGlobal("fetch", fetch);

    render(<PregnancyMedicalRecords />);
    await screen.findByRole("heading", { name: "Thêm đơn thuốc" });
    fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Đơn thuốc PDF" } });
    fireEvent.change(screen.getByLabelText(/Hồ sơ hoặc tài liệu mang theo/), {
      target: { files: [new File(["pdf"], "don-thuoc.pdf", { type: "application/pdf" })] }
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu hồ sơ" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/pregnancy/documents/"),
      expect.objectContaining({ method: "POST" })
    ));
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith("/medication-scan"))).toBe(false);
    expect(prepareImageForUpload).not.toHaveBeenCalled();
  });
});
