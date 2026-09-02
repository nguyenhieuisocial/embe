import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PregnancySymptomsPage from "../src/app/me-bau/trieu-chung/page";

const contact = {
  id: "11111111-1111-4111-8111-111111111111", kind: "doctor", name: "Bác sĩ Lan",
  organization: "Phòng khám", phone: "0901234567", note: "", primary: true
};

describe("pregnancy symptom journal page", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T08:30:00+07:00"));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return Response.json({ entry: {
          id: "22222222-2222-4222-8222-222222222222", createdAt: "2026-09-02T01:31:00.000Z", ...body
        } }, { status: 201 });
      }
      if (url.includes("/api/pregnancy/profile")) return Response.json({ profile: { contacts: [contact] } });
      return Response.json({ history: [] });
    }));
  });

  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("shows a calm, non-diagnostic journal with saved-history state", async () => {
    render(<PregnancySymptomsPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByRole("heading", { level: 1, name: "Triệu chứng & tâm trạng" })).toBeInTheDocument();
    expect(screen.getByText("Chưa có lần ghi nào.")).toBeInTheDocument();
    expect(screen.getByText(/không thay thế đánh giá của bác sĩ/i)).toBeInTheDocument();
    expect(screen.queryByText(/chẩn đoán|bình thường|bất thường/i)).not.toBeInTheDocument();
  });

  it("is reachable from one small link on the pregnancy page", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) => readFile("src/app/me-bau/page.tsx", "utf8"));
    expect(source.match(/href="\/me-bau\/trieu-chung"/g)).toHaveLength(1);
  });

  it("reveals immediate call actions when an existing urgent sign is selected", async () => {
    render(<PregnancySymptomsPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.click(screen.getByLabelText("Ra máu"));
    expect(screen.getByRole("alert")).toHaveTextContent("Không chờ EmBe");
    expect(screen.getByRole("link", { name: "Gọi 115" })).toHaveAttribute("href", "tel:115");
    expect(screen.getByRole("link", { name: "Gọi Bác sĩ Lan" })).toHaveAttribute("href", "tel:0901234567");
    expect(screen.getByLabelText(/thai máy giảm.*nơi khám đã hướng dẫn theo dõi/i)).toBeInTheDocument();
  });

  it("confirms with the server before showing a tracking entry as resolved", async () => {
    const tracking = {
      id: "22222222-2222-4222-8222-222222222222", occurredAt: "2026-09-02T01:30:00.000Z",
      symptoms: ["fever"], severity: "moderate", status: "tracking", mood: null, worry: null,
      mentalNote: "", notes: "", createdAt: "2026-09-02T01:31:00.000Z"
    };
    let confirmPatch!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PATCH") return new Promise<Response>((resolve) => { confirmPatch = resolve; });
      if (url.includes("/api/pregnancy/profile")) return Promise.resolve(Response.json({ profile: { contacts: [] } }));
      return Promise.resolve(Response.json({ history: [tracking] }));
    }));
    render(<PregnancySymptomsPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "Đánh dấu đã hết" }));
    expect(screen.getByText(/Vừa · đang theo dõi/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đang cập nhật…" })).toBeDisabled();
    await act(async () => { confirmPatch(Response.json({ entry: { ...tracking, status: "resolved" } })); await Promise.resolve(); });
    expect(screen.getByText(/Vừa · đã hết/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đánh dấu đã hết" })).not.toBeInTheDocument();
  });

  it("saves one bounded entry and adds it to history", async () => {
    render(<PregnancySymptomsPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.click(screen.getByLabelText("Sốt"));
    fireEvent.click(screen.getByLabelText("Mức vừa"));
    fireEvent.change(screen.getByLabelText("Tâm trạng"), { target: { value: "mixed" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu lần ghi" }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByRole("status")).toHaveTextContent("Đã lưu");
    expect(fetch).toHaveBeenCalledWith("/api/pregnancy/symptoms", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText("Đã ghi: Sốt")).toBeInTheDocument();
  });
});
