import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PregnancyMedicalRecords from "../src/components/pregnancy-medical-records";
import { medicalInsights, type MedicalRecord } from "../src/lib/pregnancy-medical";

const record: MedicalRecord = {
  id: "11111111-1111-4111-8111-111111111111", kind: "appointment", status: "planned",
  occurredAt: "2026-09-10T02:30:00Z", title: "Khám thai định kỳ", provider: "Bệnh viện", clinician: "",
  notes: "", gestationalWeek: 10, nextAppointmentAt: null, measurements: {}, medicines: [], documents: []
};

describe("pregnancy medical record book", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("finds the next appointment without interpreting medical results", () => {
    const result = medicalInsights([record], new Date("2026-09-01T00:00:00Z"));
    expect(result.upcoming?.title).toBe("Khám thai định kỳ");
    expect(result.completedCount).toBe(0);
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

  it("separates the next appointment from saved records when empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ records: [] }), { status: 200 })));
    render(<PregnancyMedicalRecords />);
    expect(await screen.findByRole("heading", { name: "Lịch khám tiếp theo" })).toBeInTheDocument();
    expect(screen.getByText("Chưa có lịch khám sắp tới")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hồ sơ đã lưu" })).toBeInTheDocument();
    expect(screen.getByText("Chưa có hồ sơ đã lưu")).toBeInTheDocument();
  });
});
