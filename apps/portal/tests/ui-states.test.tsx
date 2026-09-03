import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const clearPrivateGetCache = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/private-get-cache", () => ({ clearPrivateGetCache }));

import AppError from "../src/app/error";
import InventoryPage from "../src/app/do-dung/page";
import OfflinePage from "../src/app/offline/page";
import PwaRuntime from "../src/components/pwa-runtime";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

describe("offline and failure states", () => {
  afterEach(() => {
    clearPrivateGetCache.mockClear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "onLine");
    Reflect.deleteProperty(navigator, "serviceWorker");
    localStorage.clear();
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

  it("announces a newer release and reloads it without closing the app", async () => {
    setOnline(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "ok",
      version: "release-2"
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const reload = vi.spyOn(window.history, "go").mockImplementation(() => undefined);

    render(<PwaRuntime version="release-1" />);

    const update = await screen.findByRole("button", { name: "Cập nhật" });
    expect(screen.getByRole("status")).toHaveTextContent("Có phiên bản EmBe mới");
    fireEvent.click(update);
    expect(reload).toHaveBeenCalledWith(0);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers one-tap refresh when another family phone changes data", async () => {
    setOnline(true);
    const serviceWorker = new EventTarget() as EventTarget & {
      register: ReturnType<typeof vi.fn>;
      getRegistrations: ReturnType<typeof vi.fn>;
    };
    serviceWorker.register = vi.fn().mockResolvedValue({ update: vi.fn() });
    serviceWorker.getRegistrations = vi.fn().mockResolvedValue([]);
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok", version: "development" }), { status: 200 })));
    render(<PwaRuntime />);
    serviceWorker.dispatchEvent(new MessageEvent("message", { data: {
      type: "EMBE_FAMILY_ACTIVITY", title: "Mẹ Ngân vừa cập nhật", url: "/me-bau#bua-an"
    } }));

    const action = await screen.findByRole("link", { name: "Mở" });
    expect(screen.getByRole("status")).toHaveTextContent("Mẹ Ngân vừa cập nhật");
    expect(action).toHaveAttribute("href", "/me-bau#bua-an");
    fireEvent.click(action);
    expect(clearPrivateGetCache).toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows another phone's update while the app is open without push permission", async () => {
    setOnline(true);
    const postMessage = vi.fn();
    const serviceWorker = new EventTarget() as EventTarget & {
      controller: { postMessage: ReturnType<typeof vi.fn> };
      register: ReturnType<typeof vi.fn>;
      getRegistrations: ReturnType<typeof vi.fn>;
    };
    serviceWorker.controller = { postMessage };
    serviceWorker.register = vi.fn().mockResolvedValue({ update: vi.fn(), active: { postMessage } });
    serviceWorker.getRegistrations = vi.fn().mockResolvedValue([]);
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/notifications/activity")) return new Response(JSON.stringify({ activities: [{
        id: "33333333-3333-4333-8333-333333333333", kind: "meal",
        title: "Nhà mình vừa cập nhật", url: "/me-bau#bua-an", createdAt: new Date().toISOString()
      }] }), { status: 200 });
      return new Response(JSON.stringify({ status: "ok", version: "development" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PwaRuntime />);

    const action = await screen.findByRole("link", { name: "Mở" });
    expect(clearPrivateGetCache).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "EMBE_DEVICE_CONTEXT" }));
    const contextMessages = postMessage.mock.calls.length;
    serviceWorker.dispatchEvent(new Event("controllerchange"));
    expect(postMessage.mock.calls.length).toBeGreaterThan(contextMessages);

    fireEvent.click(action);
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) =>
      String(input).startsWith("/api/notifications/activity")).length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByRole("link", { name: "Mở" })).toBeNull();
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
