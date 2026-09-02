import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PregnancyMentalHealthPage from "../src/app/me-bau/tam-trang/page";

const history = [
  { id: "11111111-1111-4111-8111-111111111111", occurredAt: "2026-09-02T01:30:00.000Z", mood: 4, anxiety: 2, note: "Được nghỉ ngơi.", phq2Interest: null, phq2Depressed: null, gad2Nervous: null, gad2Control: null, createdAt: "2026-09-02T01:31:00.000Z" },
  { id: "22222222-2222-4222-8222-222222222222", occurredAt: "2026-08-28T01:30:00.000Z", mood: 2, anxiety: 4, note: "", phq2Interest: 1, phq2Depressed: 2, gad2Nervous: 1, gad2Control: 1, createdAt: "2026-08-28T01:31:00.000Z" },
  { id: "33333333-3333-4333-8333-333333333333", occurredAt: "2026-08-10T01:30:00.000Z", mood: 3, anxiety: 3, note: "", phq2Interest: null, phq2Depressed: null, gad2Nervous: null, gad2Control: null, createdAt: "2026-08-10T01:31:00.000Z" }
];

describe("pregnancy mental-health check-in", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T08:30:00+07:00"));
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return Response.json({ checkin: { id: "44444444-4444-4444-8444-444444444444", createdAt: "2026-09-02T01:32:00.000Z", ...body } }, { status: 201 });
      }
      return Response.json({ history });
    }));
  });

  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("offers an independent, non-diagnostic check-in with optional screening closed", async () => {
    render(<PregnancyMentalHealthPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByRole("heading", { level: 1, name: "Tâm trạng của Mẹ" })).toBeInTheDocument();
    expect(screen.queryByText("Dấu hiệu đang có")).not.toBeInTheDocument();
    expect(screen.getAllByText(/không phải chẩn đoán/i)).not.toHaveLength(0);
    const screening = screen.getByText("Bộ câu hỏi PHQ-2 & GAD-2 (tự chọn)").closest("details");
    expect(screening).not.toHaveAttribute("open");
    expect(screen.getByRole("link", { name: "Gọi 115" })).toHaveAttribute("href", "tel:115");
  });

  it("shows compact 7-day and 28-day trends plus saved history", async () => {
    render(<PregnancyMentalHealthPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText("7 ngày")).toBeInTheDocument();
    expect(screen.getByText("28 ngày")).toBeInTheDocument();
    expect(screen.getByLabelText("Xu hướng 7 ngày")).toHaveTextContent("3/5");
    expect(screen.getByLabelText("Xu hướng 28 ngày")).toHaveTextContent("3/5");
    expect(screen.getByText("Được nghỉ ngơi.")).toBeInTheDocument();
  });

  it("saves mood and worry without selecting symptoms", async () => {
    render(<PregnancyMentalHealthPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "Khá ổn" }));
    fireEvent.click(screen.getByRole("button", { name: "Hơi lo" }));
    fireEvent.change(screen.getByLabelText("Điều Mẹ muốn lưu lại"), { target: { value: "Đã nói chuyện với Hiếu." } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu cảm nhận" }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(fetch).toHaveBeenCalledWith("/api/pregnancy/mental-health", expect.objectContaining({ method: "POST" }));
    expect(screen.getByRole("status")).toHaveTextContent("Đã lưu");
  });

  it("is linked separately from symptoms on the pregnancy page", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) => readFile("src/app/me-bau/page.tsx", "utf8"));
    expect(source).toContain('href="/me-bau/tam-trang"');
    expect(source).toContain('href="/me-bau/trieu-chung"');
  });
});
