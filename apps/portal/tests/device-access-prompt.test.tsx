import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DeviceAccessPrompt from "../src/components/device-access-prompt";

const originalPermissions = Object.getOwnPropertyDescriptor(navigator, "permissions");

describe("iPhone access guide", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => success({
          coords: { latitude: 10.7769, longitude: 106.7009, accuracy: 18 }
        } as GeolocationPosition))
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalPermissions) Object.defineProperty(navigator, "permissions", originalPermissions);
    else Reflect.deleteProperty(navigator, "permissions");
    document.body.style.overflow = "";
  });

  it("proactively offers the useful iPhone permissions", () => {
    render(<DeviceAccessPrompt />);

    expect(screen.getByRole("dialog", { name: "Hoàn tất trên iPhone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cho phép vị trí" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bật thông báo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở kết nối Sức khỏe" })).toHaveAttribute("href", "/me-bau/suc-khoe-iphone");
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("requests location only after a tap and remembers it on this phone", async () => {
    render(<DeviceAccessPrompt />);
    fireEvent.click(screen.getByRole("button", { name: "Cho phép vị trí" }));

    await waitFor(() => expect(screen.getByText("Đã cho phép trên điện thoại này.")).toBeInTheDocument());
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledOnce();
    expect(JSON.parse(localStorage.getItem("embe:last-location") ?? "null")).toMatchObject({
      latitude: 10.7769,
      longitude: 106.7009
    });
  });

  it("lets the family postpone the guide without showing it on every page", () => {
    const { unmount } = render(<DeviceAccessPrompt />);
    fireEvent.click(screen.getByRole("button", { name: "Để sau" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    unmount();

    render(<DeviceAccessPrompt />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps keyboard focus in the guide and restores it when Escape dismisses", () => {
    render(<><button autoFocus>Quay lại nội dung</button><DeviceAccessPrompt /></>);
    const outside = screen.getByRole("button", { name: "Quay lại nội dung" });
    const close = screen.getByRole("button", { name: "Đóng thiết lập" });
    const last = screen.getByRole("button", { name: "Để sau" });
    expect(close).toHaveFocus();
    expect(outside).toHaveAttribute("inert");
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(close).toHaveFocus();
    outside.focus();
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(outside).not.toHaveAttribute("inert");
    expect(outside).toHaveFocus();
    expect(Number(localStorage.getItem("embe:access-guide-dismissed-at"))).toBeGreaterThan(0);
  });

  it("dismisses from the backdrop without discarding saved device choices", () => {
    localStorage.setItem("embe:last-location", JSON.stringify({ latitude: 10.7769, longitude: 106.7009 }));
    localStorage.setItem("embe:notify-at", "09:30");
    document.body.style.overflow = "clip";
    const { container } = render(<><div inert data-testid="already-inert">Nền đã khóa</div><DeviceAccessPrompt /></>);
    fireEvent.click(screen.getByRole("heading", { name: "Hoàn tất trên iPhone" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(container.querySelector(".access-guide-backdrop")!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("embe:notify-at")).toBe("09:30");
    expect(JSON.parse(localStorage.getItem("embe:last-location")!)).toMatchObject({ latitude: 10.7769 });
    expect(screen.getByTestId("already-inert")).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("clip");
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("does not mistake a previously stored coordinate for a still-granted permission", async () => {
    localStorage.setItem("embe:last-location", JSON.stringify({ latitude: 10.7769 }));
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue({ state: "denied" }) }
    });
    render(<DeviceAccessPrompt />);
    await waitFor(() => expect(screen.getByText("Đang bị chặn trong cài đặt quyền riêng tư của iPhone.")).toBeInTheDocument());
    expect(screen.queryByText("Đã cho phép trên điện thoại này.")).not.toBeInTheDocument();
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("does not claim location permission from cached coordinates when the Permissions API is absent", () => {
    localStorage.setItem("embe:last-location", JSON.stringify({ latitude: 10.7769 }));
    Reflect.deleteProperty(navigator, "permissions");
    render(<DeviceAccessPrompt />);
    expect(screen.queryByText("Đã cho phép trên điện thoại này.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cho phép vị trí" })).toBeEnabled();
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("keeps the page usable when Safari blocks local storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    render(<DeviceAccessPrompt />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });
});
