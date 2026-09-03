import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SystemStatus from "../src/components/system-status";

describe("family system status", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows a compact, understandable status and can check again", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      services: { data: "ready", journal: "limited", food: "ready", assistant: "paused", notifications: "setup", photos: "ready" },
      notificationRoles: { mother: true, father: false }
    }), { status: 200 }));

    render(<SystemStatus />);

    expect(await screen.findByText("Dữ liệu gia đình")).toBeInTheDocument();
    expect(screen.getByText("Nhật ký đang cập nhật chậm")).toBeInTheDocument();
    expect(screen.getByText("Trợ lý đang nghỉ")).toBeInTheDocument();
    expect(screen.getByText("Thông báo cần thiết lập")).toBeInTheDocument();
    expect(screen.getByText("Mẹ Ngân đã bật · Ba Hiếu chưa bật")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thiết lập điện thoại còn lại" })).toHaveAttribute("href", "/cai-dat#thiet-lap-dien-thoai");
    expect(screen.getAllByText("Sẵn sàng").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra lại tình trạng EmBe" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("keeps the page useful when status cannot be loaded", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    render(<SystemStatus />);
    expect(await screen.findByText("Chưa kiểm tra được lúc này")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kiểm tra lại tình trạng EmBe" })).toBeEnabled();
  });
});
