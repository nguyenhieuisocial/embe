import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PregnancyMedicalRecords from "../src/components/pregnancy-medical-records";
import {
  decodeAppointmentWorkspace,
  encodeAppointmentWorkspace,
  medicalInsights,
  type MedicalRecord
} from "../src/lib/pregnancy-medical";
import { clearPrivateGetCache } from "../src/lib/private-get-cache";

const record: MedicalRecord = {
  id: "11111111-1111-4111-8111-111111111111", kind: "appointment", status: "planned",
  occurredAt: "2026-09-10T02:30:00Z", title: "Khám thai định kỳ", provider: "Bệnh viện", clinician: "",
  notes: "", gestationalWeek: 10, nextAppointmentAt: null, measurements: {}, medicines: [], documents: []
};

describe("pregnancy medical record book", () => {
  afterEach(() => {
    clearPrivateGetCache();
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });

  it("finds the next appointment without interpreting medical results", () => {
    const result = medicalInsights([record], new Date("2026-09-01T00:00:00Z"));
    expect(result.upcoming?.title).toBe("Khám thai định kỳ");
    expect(result.upcoming?.followUpFromCompleted).toBe(false);
    expect(result.completedCount).toBe(0);
  });

  it("shows a completed visit's follow-up date as the next appointment", () => {
    const completed: MedicalRecord = {
      ...record,
      status: "completed",
      occurredAt: "2026-09-02T02:30:00Z",
      nextAppointmentAt: "2026-09-16T02:30:00Z"
    };

    const result = medicalInsights([completed], new Date("2026-09-03T00:00:00Z"));

    expect(result.upcoming).toMatchObject({
      id: completed.id,
      occurredAt: "2026-09-16T02:30:00Z",
      followUpFromCompleted: true
    });
  });

  it("opens a compact classified form and shows the private timeline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ records: [record] }), { status: 200 })));
    render(<PregnancyMedicalRecords />);
    expect((await screen.findAllByText("Khám thai định kỳ")).length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "+ Thêm hồ sơ" }));
    const classifier = screen.getByRole("group", { name: "Phân loại hồ sơ" });
    expect(classifier).toBeInTheDocument();
    fireEvent.click(within(classifier).getByRole("button", { name: "Đơn thuốc" }));
    await waitFor(() => expect(screen.getByText("Thuốc ghi trên đơn")).toBeInTheDocument());
    expect(screen.getByText(/Chỉ Hiếu và Ngân xem được/)).toBeInTheDocument();
  });

  it("opens the prescription form directly from a quick link", async () => {
    window.history.replaceState({}, "", "/me-bau/ho-so?quick=prescription#ho-so-kham");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ records: [] }), { status: 200 })));

    render(<PregnancyMedicalRecords />);

    expect(await screen.findByRole("heading", { name: "Thêm đơn thuốc" })).toBeInTheDocument();
    expect(screen.getByText("Có thể nhập ngay hoặc để trống rồi chụp ảnh đơn thuốc bên dưới.")).toBeInTheDocument();
    expect(screen.getByLabelText("Tên thuốc")).not.toBeRequired();
  });

  it("hydrates medicines when editing a saved prescription", async () => {
    const prescription: MedicalRecord = {
      ...record, kind: "prescription", status: "completed", title: "Đơn thuốc ngày khám",
      medicines: [{ name: "Sắt", dose: "1 viên", frequency: "mỗi sáng", instructions: "Sau ăn" }]
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ records: [prescription] }), { status: 200 })));

    render(<PregnancyMedicalRecords />);
    fireEvent.click(await screen.findByRole("button", { name: "Sửa" }));

    expect(screen.getByRole("heading", { name: "Sửa đơn thuốc" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tên thuốc")).toHaveValue("Sắt");
    expect(screen.getByLabelText("Liều")).toHaveValue("1 viên");
    expect(screen.getByLabelText("Số lần")).toHaveValue("mỗi sáng");
    expect(screen.getByLabelText("Cách dùng")).toHaveValue("Sau ăn");
  });

  it("separates the next appointment from saved records when empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ records: [] }), { status: 200 })));
    render(<PregnancyMedicalRecords />);
    expect(await screen.findByRole("heading", { name: "Lịch khám tiếp theo" })).toBeInTheDocument();
    expect(screen.getByText("Chưa có lịch khám sắp tới")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hồ sơ đã lưu" })).toBeInTheDocument();
    expect(screen.getByText("Chưa có hồ sơ đã lưu")).toBeInTheDocument();
  });

  it("round-trips a bounded appointment preparation workspace without a new schema", () => {
    const encoded = encodeAppointmentWorkspace({
      questions: ["Có cần đổi lịch xét nghiệm không?", "Kết quả nào cần mang theo?"],
      checklist: ["papers", "results"],
      outcome: "Tiếp tục theo dõi theo lời dặn."
    });

    expect(encoded.startsWith("EMBE_APPOINTMENT_V1\n")).toBe(true);
    expect(decodeAppointmentWorkspace(encoded)).toEqual({
      questions: ["Có cần đổi lịch xét nghiệm không?", "Kết quả nào cần mang theo?"],
      checklist: ["papers", "results"],
      outcome: "Tiếp tục theo dõi theo lời dặn."
    });
    expect(decodeAppointmentWorkspace("Ghi chú cũ").outcome).toBe("Ghi chú cũ");
  });

  it("shows the next appointment as a one-hand preparation workspace with linked documents", async () => {
    const prepared: MedicalRecord = {
      ...record,
      notes: 'EMBE_APPOINTMENT_V1\n{"questions":["Cần làm xét nghiệm nào?"],"checklist":["papers","results"],"outcome":""}',
      documents: [{
        id: "22222222-2222-4222-8222-222222222222", originalFilename: "phieu-hen.pdf",
        mimeType: "application/pdf", byteSize: 1200, createdAt: "2026-09-01T02:00:00Z"
      }]
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ records: [prepared] }), { status: 200 })));

    render(<PregnancyMedicalRecords />);

    const appointment = (await screen.findByRole("heading", { name: "Buổi khám sắp tới" })).closest("article");
    expect(appointment).not.toBeNull();
    expect(within(appointment!).getByText("Cần làm xét nghiệm nào?")).toBeInTheDocument();
    expect(within(appointment!).getByText(/Mang giấy tờ và sổ khám/)).toBeInTheDocument();
    expect(within(appointment!).getByRole("link", { name: /phieu-hen\.pdf/i })).toHaveAttribute(
      "href", "/api/pregnancy/documents/22222222-2222-4222-8222-222222222222"
    );

    fireEvent.click(screen.getByRole("button", { name: "Chuẩn bị buổi khám" }));
    expect(screen.getByRole("heading", { name: "Chuẩn bị buổi khám" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Câu hỏi muốn hỏi bác sĩ" })).toHaveValue("Cần làm xét nghiệm nào?");
    expect(screen.getByRole("checkbox", { name: "Mang giấy tờ và sổ khám" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Lưu chuẩn bị" })).toBeInTheDocument();
  });

  it("links a follow-up date from a completed visit to the family calendar", async () => {
    const followUp: MedicalRecord = {
      ...record,
      status: "completed",
      occurredAt: "2099-09-10T02:30:00Z",
      nextAppointmentAt: "2099-09-24T02:30:00Z"
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ records: [followUp] }), { status: 200 })));

    render(<PregnancyMedicalRecords />);

    expect(await screen.findByText("Ngày tái khám đã ghi")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở trong lịch gia đình" })).toHaveAttribute("href", "/lich");
    expect(screen.queryByRole("button", { name: "Ghi kết quả sau khám" })).not.toBeInTheDocument();
  });

  it("turns a planned appointment into a completed visit while preserving preparation", async () => {
    let saved: MedicalRecord = {
      ...record,
      notes: 'EMBE_APPOINTMENT_V1\n{"questions":["Có cần hẹn lại sớm?"],"checklist":["papers"],"outcome":""}'
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/pregnancy/records" && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        saved = {
          ...saved,
          id: String(payload.id), status: payload.status as MedicalRecord["status"],
          notes: String(payload.notes), nextAppointmentAt: payload.nextAppointmentAt ? String(payload.nextAppointmentAt) : null
        };
        return new Response(JSON.stringify({ id: saved.id }), { status: 200 });
      }
      return new Response(JSON.stringify({ records: [saved] }), { status: 200 });
    }));

    render(<PregnancyMedicalRecords />);
    await screen.findByRole("heading", { name: "Buổi khám sắp tới" });
    fireEvent.click(screen.getByRole("button", { name: "Ghi kết quả sau khám" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Kết quả và lời dặn sau khám" }), {
      target: { value: "Bác sĩ dặn theo dõi và tái khám đúng hẹn." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu kết quả" }));

    expect(await screen.findByText("Bác sĩ dặn theo dõi và tái khám đúng hẹn.")).toBeInTheDocument();
    expect(saved.status).toBe("completed");
    expect(decodeAppointmentWorkspace(saved.notes).questions).toEqual(["Có cần hẹn lại sớm?"]);
  });
});
