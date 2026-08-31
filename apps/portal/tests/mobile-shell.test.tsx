import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/ghi-lai" }));

import FamilyNav from "../src/components/family-nav";
import GuidePage from "../src/app/huong-dan/page";

describe("mobile family shell", () => {
  it("offers the four everyday destinations as a compact navigation", () => {
    render(<FamilyNav />);

    expect(screen.getByRole("navigation", { name: "Điều hướng gia đình" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hôm nay" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Ghi lại" })).toHaveAttribute("href", "/ghi-lai");
    expect(screen.getByRole("link", { name: "Ghi lại" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Mẹ bầu" })).toHaveAttribute("href", "/me-bau");
    expect(screen.getByRole("link", { name: "Kỷ niệm" })).toHaveAttribute("href", "/ky-niem");
    expect(screen.getByRole("link", { name: "Đồ dùng" })).toHaveAttribute("href", "/do-dung");
  });

  it("reserves iPhone safe areas and prevents password-field zoom", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(/\.login-form input\[type="password"\][^{]*\{[^}]*font-size:\s*(?:1rem|16px)/s);
    expect(css).toContain("min-height: 100dvh");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("env(safe-area-inset-left)");
    expect(css).toContain("env(safe-area-inset-right)");
  });

  it("keeps touch interactions native-like without relying on hover", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(/a, button, input, select, textarea\s*\{[^}]*touch-action:\s*manipulation/s);
    expect(css).toMatch(/@media \(hover: hover\) and \(pointer: fine\)[\s\S]*\.primary-link:hover/);
    expect(css).toMatch(/\.family-nav a\s*\{[^}]*min-height:\s*(?:52|5[3-9]|[6-9]\d)px/s);
  });

  it("gives compact text links a full iPhone touch target", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(/\.wordmark\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.rhythm-item a[^\{]*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.source-section a\s*\{[^}]*min-height:\s*44px/s);
  });

  it("offers an explicit logout action for a shared or lost phone", () => {
    render(<GuidePage />);

    const button = screen.getByRole("button", { name: "Đăng xuất khỏi EmBe" });
    expect(button.closest("form")).toHaveAttribute("action", "/api/auth/logout");
    expect(button.closest("form")).toHaveAttribute("method", "post");
  });
});
