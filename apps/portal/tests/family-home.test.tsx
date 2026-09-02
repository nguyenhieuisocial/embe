import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FamilyHomePage from "../src/app/nha-minh/page";

describe("family home hub", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.EMBE_PHOTO_SERVER_URL;
    delete process.env.EMBE_PHOTO_ACCOUNT;
  });

  it("groups the less frequent family tools away from the bottom navigation", () => {
    render(<FamilyHomePage />);

    expect(screen.getByRole("heading", { level: 1, name: "Nhà mình" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở đồ dùng" })).toHaveAttribute("href", "/do-dung");
    expect(screen.getByRole("link", { name: "Mở trợ lý" })).toHaveAttribute("href", "/tro-ly");
    expect(screen.getByRole("link", { name: "Xem hướng dẫn" })).toHaveAttribute("href", "/huong-dan");
    expect(screen.getByRole("link", { name: "Mở lịch gia đình" })).toHaveAttribute("href", "/lich");
    expect(screen.getByRole("link", { name: "Mở Sổ Mẹ và Bé" })).toHaveAttribute("href", "/so-me-va-be");
    expect(screen.getByRole("link", { name: "Mở cài đặt" })).toHaveAttribute("href", "/cai-dat");
    expect(screen.getByText("Chọn công cụ cần mở hoặc thiết lập điện thoại này.")).toBeInTheDocument();
  });

  it("never renders an unavailable photo endpoint as a broken link", () => {
    render(<FamilyHomePage />);

    expect(screen.getByText("Thư viện ảnh riêng")).toBeInTheDocument();
    expect(screen.getByText("Địa chỉ kết nối chỉ hiện khi máy nhà sẵn sàng.")).toBeInTheDocument();
  });

  it("reloads EmBe from inside the app instead of requiring it to be closed", () => {
    const reload = vi.spyOn(window.history, "go").mockImplementation(() => undefined);
    render(<FamilyHomePage />);

    fireEvent.click(screen.getByRole("button", { name: "Tải lại EmBe" }));

    expect(reload).toHaveBeenCalledWith(0);
  });
});
