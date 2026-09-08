import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import DeviceSetup from "../src/components/device-setup";

describe("per-phone family setup", () => {
  beforeEach(() => localStorage.clear());

  it("remembers whose iPhone this is without asking on every action", () => {
    render(<DeviceSetup />);
    fireEvent.click(screen.getByRole("button", { name: "Điện thoại của Mẹ Ngân" }));
    expect(localStorage.getItem("embe:device-role")).toBe("mother");
    expect(screen.queryByRole("button", { name: "Điện thoại của Mẹ Ngân" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đổi người dùng · Mẹ Ngân" })).toBeInTheDocument();
  });

  it("does not ask a remembered owner again and only edits on request", () => {
    localStorage.setItem("embe:device-role", "father");
    const { unmount } = render(<DeviceSetup />);
    expect(screen.queryByText("Chọn một lần để ảnh, nhật ký và phản hồi tự điền đúng tên.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đổi người dùng · Ba Hiếu" }));
    fireEvent.click(screen.getByRole("button", { name: "Điện thoại của Mẹ Ngân" }));
    expect(localStorage.getItem("embe-photo-author")).toBe("mother");
    unmount();
    render(<DeviceSetup />);
    expect(screen.queryByRole("button", { name: "Điện thoại của Mẹ Ngân" })).not.toBeInTheDocument();
  });

  it("offers one-tap notification setup on a family phone", () => {
    render(<DeviceSetup />);
    expect(screen.getByRole("button", { name: "Bật thông báo" })).toBeInTheDocument();
    expect(screen.getByText(/lịch khám, việc đến hạn và đồ dùng sắp hết/i)).toBeInTheDocument();
  });
});
