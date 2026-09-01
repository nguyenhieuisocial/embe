import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InventoryPage from "../src/app/do-dung/page";

describe("mobile inventory page", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/do-dung");
  });
  afterEach(() => {
    window.history.replaceState({}, "", "/do-dung");
    vi.unstubAllGlobals();
  });

  it("opens the add form directly from the global quick action", async () => {
    window.history.replaceState({}, "", "/do-dung?them=1#them-do-dung");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], pending: 0 }), { status: 200 })
    ));

    render(<InventoryPage />);

    expect(await screen.findByRole("button", { name: "Lưu đồ dùng" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tên đồ dùng")).toBeInTheDocument();
  });

  it("guides the family when the private inventory is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], pending: 0 }), { status: 200 })
    ));

    render(<InventoryPage />);

    expect(await screen.findByText("Chưa có đồ dùng nào")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm đồ dùng đầu tiên" })).toBeInTheDocument();
  });

  it("queues a one-tap consume action and refreshes the snapshot", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ productId: 12, name: "Bỉm sơ sinh", quantity: 7, unit: "cái", minQuantity: 10, needsRestock: true }],
        pending: 0
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "accepted" }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ productId: 12, name: "Bỉm sơ sinh", quantity: 7, unit: "cái", minQuantity: 10, needsRestock: true }],
        pending: 1
      }), { status: 200 }));
    vi.stubGlobal("fetch", request);

    render(<InventoryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Đã dùng 1 Bỉm sơ sinh" }));

    await waitFor(() => expect(screen.getByText("Đã ghi nhận · hệ thống đang cập nhật")).toBeInTheDocument());
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("keeps the add form intact when the queue is unavailable", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], pending: 0 }), { status: 200 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", request);

    render(<InventoryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Thêm đồ dùng đầu tiên" }));
    fireEvent.change(screen.getByLabelText("Tên đồ dùng"), { target: { value: "Khăn ướt" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu đồ dùng" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa cập nhật được");
    expect(screen.getByDisplayValue("Khăn ướt")).toBeInTheDocument();
  });

  it("shows the last valid inventory snapshot instead of a blank page while offline", async () => {
    localStorage.setItem("embe:inventory:last-snapshot", JSON.stringify({
      savedAt: "2026-09-01T00:00:00.000Z",
      snapshot: {
        items: [{ productId: 12, name: "Bỉm sơ sinh", quantity: 7, unit: "cái", minQuantity: 10, needsRestock: true }],
        pending: 0
      }
    }));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<InventoryPage />);

    expect(await screen.findByText("Bỉm sơ sinh")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Đang xem danh sách đã lưu");
    expect(screen.queryByText("Chưa cập nhật được đồ dùng")).not.toBeInTheDocument();
  });
});
