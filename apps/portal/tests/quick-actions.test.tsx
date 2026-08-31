import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import QuickActions from "../src/components/quick-actions";

describe("mobile quick actions", () => {
  it("opens four everyday actions from one thumb-friendly control", () => {
    render(<QuickActions />);

    const trigger = screen.getByRole("button", { name: "Mở thao tác nhanh" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Làm nhanh" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ghi một dòng/ })).toHaveAttribute("href", "/ghi-lai#viet-nhat-ky");
    expect(screen.getByRole("link", { name: /Chụp hoặc chọn ảnh/ })).toHaveAttribute("href", "/ky-niem#gui-anh");
    expect(screen.getByRole("link", { name: /Lưu sức khỏe/ })).toHaveAttribute("href", "/me-bau#health-title");
    expect(screen.getByRole("link", { name: /Thêm đồ dùng/ })).toHaveAttribute("href", "/do-dung?them=1#them-do-dung");
  });

  it("closes without navigating when Escape is pressed", () => {
    render(<QuickActions />);
    fireEvent.click(screen.getByRole("button", { name: "Mở thao tác nhanh" }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Làm nhanh" }), { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Làm nhanh" })).not.toBeInTheDocument();
  });
});
