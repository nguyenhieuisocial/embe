import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FamilyBookExport from "../src/components/family-book-export";

const { downloadFamilyBookPdf, openFamilyBookPdf, shareFamilyBookPdf } = vi.hoisted(() => ({
  downloadFamilyBookPdf: vi.fn(async () => undefined),
  openFamilyBookPdf: vi.fn(async () => undefined),
  shareFamilyBookPdf: vi.fn(async () => undefined)
}));

vi.mock("../src/lib/family-book-pdf", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/lib/family-book-pdf")>(),
  downloadFamilyBookPdf,
  openFamilyBookPdf,
  shareFamilyBookPdf
}));

function responseFor(url: string): Response {
  if (url.startsWith("/api/pregnancy/health")) return Response.json({ history: [
    { day: "2026-08-31", weightKg: 52.4, systolic: 110, diastolic: 70, sleepMinutes: 420, waterGlasses: 7, movementMinutes: 20, wellbeing: 4, checklistPercent: 70 },
    { day: "2026-09-01", weightKg: 52.5, systolic: 112, diastolic: 72, sleepMinutes: 450, waterGlasses: 8, movementMinutes: 25, wellbeing: 4, checklistPercent: 80 }
  ] });
  if (url.startsWith("/api/pregnancy/care")) return Response.json({ snapshot: { plans: [{
    id: "11111111-1111-4111-8111-111111111111", category: "supplement", name: "Vi chất theo đơn",
    dose_display: "1 viên", times_per_day: 1, instructions: "Sau ăn", confirmed_by_clinician: true, active: true
  }] } });
  if (url === "/api/pregnancy/records") return Response.json({ records: [{
    id: "22222222-2222-4222-8222-222222222222", kind: "ultrasound", status: "completed",
    occurredAt: "2026-08-30T08:00:00Z", title: "Siêu âm", provider: "Nơi khám", clinician: "",
    notes: "Lời dặn đã ghi", gestationalWeek: 7, nextAppointmentAt: null,
    measurements: { fetalHeartRate: 150 }, medicines: [], documents: []
  }] });
  return Response.json({ dueDate: "2027-04-15", completed: [], hasProfile: true, hasDayState: true });
}

describe("family mother and baby book", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    downloadFamilyBookPdf.mockClear();
    openFamilyBookPdf.mockClear();
    shareFamilyBookPdf.mockClear();
  });

  it("renders a private printable summary from real portal endpoints", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => responseFor(String(input)));
    render(<FamilyBookExport />);

    expect(await screen.findByRole("article", { name: "Bản xem trước Sổ Mẹ và Bé" })).toBeInTheDocument();
    expect(screen.getByText("52.5 kg")).toBeInTheDocument();
    expect(screen.getByText("Nhịp tim thai")).toBeInTheDocument();
    expect(screen.getByText("Vi chất theo đơn")).toBeInTheDocument();
    expect(screen.getByText(/EmBe không dùng chúng để chẩn đoán/)).toBeInTheDocument();
  });

  it("downloads and opens the same PDF for printing, then reloads the selected range", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => responseFor(String(input)));
    render(<FamilyBookExport />);

    const pdfButton = await screen.findByRole("button", { name: /Tải PDF/ });
    fireEvent.click(pdfButton);
    await waitFor(() => expect(downloadFamilyBookPdf).toHaveBeenCalledOnce());

    const printButton = screen.getByRole("button", { name: "In" });
    fireEvent.click(printButton);
    await waitFor(() => expect(openFamilyBookPdf).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "Chia sẻ PDF" }));
    await waitFor(() => expect(shareFamilyBookPdf).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "7 ngày" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("days=7"))).toBe(true));
  });
});
