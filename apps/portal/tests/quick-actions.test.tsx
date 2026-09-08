import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/me-bau", postpartum: false }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("../src/lib/use-family-stage", () => ({ useFamilyStage: () => ({ postpartum: route.postpartum }) }));
vi.mock("../src/components/device-access-prompt", () => ({ default: () => null }));

import QuickActions from "../src/components/quick-actions";
import AppShell from "../src/components/app-shell";

afterEach(() => {
  document.body.style.overflow = "";
  route.pathname = "/me-bau";
  route.postpartum = false;
});

describe("mobile quick actions", () => {
  it("opens the everyday actions from one thumb-friendly control", () => {
    render(<QuickActions />);

    const trigger = screen.getByRole("button", { name: "Mở thao tác nhanh" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Ghi nhanh" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Cài giai đoạn thai kỳ/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ghi sức khỏe/ })).toHaveAttribute("href", "/me-bau/suc-khoe");
    expect(screen.getByRole("link", { name: /Thêm lịch khám/ })).toHaveAttribute("href", "/me-bau/ho-so?quick=appointment#ho-so-kham");
    expect(screen.getByRole("link", { name: /Ghi bữa ăn/ })).toHaveAttribute("href", "/me-bau/bua-an");
    expect(screen.getByRole("link", { name: /Thêm việc cần làm/ })).toHaveAttribute("href", "/ke-hoach?them=1#them-viec");
    expect(screen.getByRole("link", { name: /Ghi một dòng/ })).toHaveAttribute("href", "/ghi-lai#viet-nhat-ky");
    expect(screen.getByRole("link", { name: /Chụp hoặc chọn ảnh/ })).toHaveAttribute("href", "/ky-niem#gui-anh");
    expect(screen.getByRole("link", { name: /Chụp hoặc chọn giấy tờ/ })).toHaveAttribute("href", "/me-bau/ho-so#them-giay-to");
  });

  it("keeps the document shortcut after birth and releases the sheet when selected", () => {
    route.postpartum = true;
    render(<QuickActions />);
    fireEvent.click(screen.getByRole("button", { name: "Mở thao tác nhanh" }));
    const document = screen.getByRole("link", { name: /Chụp hoặc chọn giấy tờ/ });
    expect(document).toHaveAttribute("href", "/me-bau/ho-so#them-giay-to");
    fireEvent.click(document);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(globalThis.document.body.style.overflow).toBe("");
  });

  it("closes without navigating when Escape is pressed", () => {
    render(<QuickActions />);
    fireEvent.click(screen.getByRole("button", { name: "Mở thao tác nhanh" }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Ghi nhanh" }), { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Ghi nhanh" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mở thao tác nhanh" })).toHaveFocus();
  });

  it("keeps keyboard focus inside the sheet and returns it after dismissing", () => {
    render(<><button>Phía sau</button><QuickActions /></>);
    const outside = screen.getByRole("button", { name: "Phía sau" });
    fireEvent.click(screen.getByRole("button", { name: "Mở thao tác nhanh" }));
    const close = screen.getByRole("button", { name: "Đóng" });
    const last = screen.getByRole("link", { name: /Chụp hoặc chọn ảnh/ });
    expect(close).toHaveFocus();

    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(close).toHaveFocus();
    outside.focus();
    expect(close).toHaveFocus();

    fireEvent.click(close);
    expect(outside).not.toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Mở thao tác nhanh" })).toHaveFocus();
  });

  it("blocks background interaction and restores existing scroll and inert settings", () => {
    document.body.style.overflow = "clip";
    const { container } = render(<><div data-testid="background">Nội dung</div><div inert data-testid="already-inert">Đã khóa</div><QuickActions /></>);
    fireEvent.click(screen.getByRole("button", { name: "Mở thao tác nhanh" }));
    expect(screen.getByTestId("background")).toHaveAttribute("inert");
    expect(screen.getByTestId("already-inert")).toHaveAttribute("inert");
    expect(screen.getByRole("dialog")).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");
    const backdrop = container.querySelector<HTMLButtonElement>(".quick-backdrop")!;
    expect(backdrop).not.toHaveAttribute("inert");
    expect(backdrop).toHaveAttribute("tabindex", "-1");
    fireEvent.click(backdrop);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("background")).not.toHaveAttribute("inert");
    expect(screen.getByTestId("already-inert")).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("clip");
  });

  it("closes and releases the page when browser navigation changes the hash", () => {
    render(<QuickActions />);
    fireEvent.click(screen.getByRole("button", { name: "Mở thao tác nhanh" }));
    fireEvent(window, new HashChangeEvent("hashchange"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  it("cleans up when navigating to another app page", () => {
    const { rerender } = render(<AppShell><main>Trang hiện tại</main></AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "Mở thao tác nhanh" }));
    expect(screen.getByRole("main").parentElement).toHaveAttribute("inert");

    route.pathname = "/ky-niem";
    rerender(<AppShell><main>Trang kỷ niệm</main></AppShell>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("main").parentElement).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByRole("button", { name: "Mở thao tác nhanh" })).toHaveAttribute("aria-expanded", "false");
  });
});
