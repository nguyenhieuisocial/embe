import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DeviceAccessPrompt from "../src/components/device-access-prompt";

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

  it("proactively offers the useful iPhone permissions", () => {
    render(<DeviceAccessPrompt />);

    expect(screen.getByRole("dialog", { name: "Hoàn tất trên iPhone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cho phép vị trí" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bật thông báo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở kết nối Sức khỏe" })).toHaveAttribute("href", "/me-bau/suc-khoe-iphone");
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
});
