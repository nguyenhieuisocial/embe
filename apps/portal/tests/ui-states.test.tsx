import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppError from "../src/app/error";
import InventoryPage from "../src/app/do-dung/page";
import OfflinePage from "../src/app/offline/page";
import PwaRuntime from "../src/components/pwa-runtime";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

describe("offline and failure states", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "onLine");
  });

  it("keeps the offline route free of a second main-content landmark", () => {
    const { container } = render(<OfflinePage />);

    expect(container.querySelector("#main-content")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Điện thoại đang mất mạng" })
    ).toBeInTheDocument();
  });

  it("tells the family they are offline in plain Vietnamese", () => {
    setOnline(false);

    render(<PwaRuntime />);

    expect(screen.getByRole("status")).toHaveTextContent("Đang ngoại tuyến");
  });

  it("stays quiet while the phone still has a connection", () => {
    setOnline(true);

    render(<PwaRuntime />);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers a Vietnamese retry instead of the framework error page", () => {
    const reset = vi.fn();

    render(<AppError error={new Error("supabase locator missing")} reset={reset} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Trang này chưa mở được" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/supabase/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Thử mở lại" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("never claims an empty cupboard when the snapshot failed to load", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<InventoryPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa cập nhật được đồ dùng");
    expect(screen.queryByText("Chưa có đồ dùng nào")).toBeNull();
  });

  it("reloads the inventory snapshot from the error state", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], pending: 0 }), { status: 200 })));

    render(<InventoryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));

    expect(await screen.findByText("Chưa có đồ dùng nào")).toBeInTheDocument();
  });
});
