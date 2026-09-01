import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MotherPostpartumPage from "../src/app/me/page";

describe("mother postpartum page", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T08:00:00+07:00"));
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return Response.json({ health: body });
      }
      return Response.json({ history: [] });
    }));
  });

  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("keeps frequent recovery actions above details and urgent guidance", async () => {
    render(<MotherPostpartumPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByRole("heading", { level: 1, name: "Mẹ hôm nay" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hồi phục cơ thể" })).toBeInTheDocument();
    expect(screen.getByText("Cho bé ăn & nghỉ ngơi")).toBeInTheDocument();
    expect(screen.getByText("Tâm trạng & sàng lọc ngắn")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dấu hiệu cần trợ giúp ngay" })).toBeInTheDocument();
  });

  it("saves one daily recovery entry", async () => {
    render(<MotherPostpartumPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.change(screen.getByLabelText("Sản dịch"), { target: { value: "light" } });
    fireEvent.change(screen.getByLabelText("Mức đau (0–10)"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu sức khỏe hôm nay" }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(fetch).toHaveBeenLastCalledWith("/api/postpartum/health", expect.objectContaining({ method: "PATCH" }));
    expect(screen.getByRole("status")).toHaveTextContent("Đã lưu nhật ký hồi phục");
  });
});
