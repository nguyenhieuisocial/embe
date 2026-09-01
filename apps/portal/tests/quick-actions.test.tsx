import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import QuickActions from "../src/components/quick-actions";

describe("mobile quick actions", () => {
  it("opens the everyday actions from one thumb-friendly control", () => {
    render(<QuickActions />);

    const trigger = screen.getByRole("button", { name: "Mở thao tác nhanh" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Ghi nhanh" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cài giai đoạn thai kỳ/ })).toHaveAttribute("href", "/me-bau#cai-dat-giai-doan");
    expect(screen.getByRole("link", { name: /Thêm lịch khám/ })).toHaveAttribute("href", "/me-bau?quick=appointment#ho-so-kham");
    expect(screen.getByRole("link", { name: /Chụp bữa ăn/ })).toHaveAttribute("href", "/me-bau?quick=meal#bua-an");
    expect(screen.getByRole("link", { name: /Thêm việc cần làm/ })).toHaveAttribute("href", "/ke-hoach?them=1#them-viec");
    expect(screen.getByRole("link", { name: /Ghi một dòng/ })).toHaveAttribute("href", "/ghi-lai#viet-nhat-ky");
    expect(screen.getByRole("link", { name: /Chụp hoặc chọn ảnh/ })).toHaveAttribute("href", "/ky-niem#gui-anh");
  });

  it("closes without navigating when Escape is pressed", () => {
    render(<QuickActions />);
    fireEvent.click(screen.getByRole("button", { name: "Mở thao tác nhanh" }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Ghi nhanh" }), { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Ghi nhanh" })).not.toBeInTheDocument();
  });
});
