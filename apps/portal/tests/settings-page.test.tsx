import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SettingsPage from "../src/app/cai-dat/page";

describe("family settings page", () => {
  it("keeps advanced controls discoverable without crowding the daily pages", () => {
    render(<SettingsPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Cài đặt" })).toBeInTheDocument();
    expect(screen.getByText("Giao diện & thao tác").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "Ngày sinh của Ba & Mẹ" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở cài đặt giai đoạn thai kỳ" })).toHaveAttribute("href", "/me-bau#cai-dat-giai-doan");
    fireEvent.click(screen.getByText("Giao diện & thao tác"));
    expect(screen.getByRole("heading", { name: "Hiển thị trên điện thoại này" })).toBeVisible();
    expect(screen.getByText("Dữ liệu & khôi phục").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Dữ liệu & khôi phục"));
    expect(screen.getByRole("heading", { name: "Dữ liệu của gia đình" })).toBeInTheDocument();
  });
});
