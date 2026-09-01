import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/ke-hoach" }));

import FamilyNav from "../src/components/family-nav";
import GuidePage from "../src/app/huong-dan/page";

function escapeSelector(selector: string): string {
  return selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasRule(css: string, selector: string): boolean {
  return new RegExp(`${escapeSelector(selector)}\\s*[,{]`).test(css);
}

function ruleBody(css: string, selector: string): string {
  return new RegExp(`${escapeSelector(selector)}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
}

describe("mobile family shell", () => {
  it("offers the five everyday destinations as a compact navigation", () => {
    render(<FamilyNav />);

    expect(screen.getByRole("navigation", { name: "Điều hướng gia đình" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hôm nay" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Kế hoạch" })).toHaveAttribute("href", "/ke-hoach");
    expect(screen.getByRole("link", { name: "Kế hoạch" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Hành trình" })).toHaveAttribute("href", "/me-bau");
    expect(screen.getByRole("link", { name: "Kỷ niệm" })).toHaveAttribute("href", "/ky-niem");
    expect(screen.getByRole("link", { name: "Nhà mình" })).toHaveAttribute("href", "/nha-minh");
  });

  it("reserves iPhone safe areas and prevents password-field zoom", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(/\.login-form input\[type="password"\][^{]*\{[^}]*font-size:\s*(?:1rem|16px)/s);
    expect(css).toContain("min-height: 100dvh");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("env(safe-area-inset-left)");
    expect(css).toContain("env(safe-area-inset-right)");
    expect(css).toContain("-webkit-text-size-adjust: 100%");
  });

  it("keeps touch interactions native-like without relying on hover", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(/a, button, input, select, textarea\s*\{[^}]*touch-action:\s*manipulation/s);
    expect(css).toMatch(/@media \(hover: hover\) and \(pointer: fine\)[\s\S]*\.action-primary:hover/);
    expect(css).toMatch(/\.family-nav a\s*\{[^}]*min-height:\s*(?:52|5[3-9]|[6-9]\d)px/s);
    expect(css).toMatch(/\.quick-trigger\s*\{[^}]*min-height:\s*(?:4[4-9]|[5-9]\d)px/s);
    expect(css).toMatch(/\.quick-trigger\s*\{[^}]*env\(safe-area-inset-bottom\)/s);
  });

  it("uses the Opus 5 tactile control system and active navigation", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toContain("--control: 54px");
    expect(css).toContain("--paper: #FBF8F1");
    expect(ruleBody(css, ".btn")).toMatch(/min-height:\s*var\(--control\)/);
    expect(ruleBody(css, ".family-nav")).toMatch(/bottom:\s*0/);
    expect(ruleBody(css, '.family-nav a[aria-current="page"]')).toMatch(/background:\s*var\(--jade-soft\)/);
    expect(css).toMatch(/button,\s*\n?\s*\[role="button"\][^{]*\{[^}]*-webkit-tap-highlight-color:\s*transparent/s);
    expect(ruleBody(css, ":focus-visible")).toMatch(/outline:\s*3px solid var\(--sun\)/);
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*:has\([^)]*:focus[^)]*\)[^{]*\.family-nav[^{]*\{[^}]*display:\s*none/s);
    expect(ruleBody(css, '.journal-form > button[type="submit"]')).toMatch(/position:\s*sticky/);
  });

  it("stacks dense form rows on phones instead of squeezing two fields together", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(/@media \(max-width: 480px\)[\s\S]*\.planner-form-row,[\s\S]*\.inventory-form-row\s*\{[^}]*grid-template-columns:\s*1fr/s);
  });

  it("gives compact text links a full iPhone touch target", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(/\.wordmark\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.rhythm-item a[^\{]*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.source-section a\s*\{[^}]*min-height:\s*44px/s);
  });

  it("keeps the EmBe wordmark visible when the private note is long", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(ruleBody(css, ".wordmark")).toMatch(/flex:\s*none/);
    expect(ruleBody(css, ".privacy-note")).toMatch(/text-overflow:\s*ellipsis/);
  });

  it("styles every class the mobile screens actually render", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    for (const selector of [
      ".skip-link",
      ".connection-banner",
      ".family-hero-art",
      ".pregnancy-care-art",
      ".trimester-grid",
      ".urgent-care",
      ".journal-prompts",
      ".journal-queued",
      ".bare-page",
      ".bare-card",
      ".inventory-error"
    ]) {
      expect(hasRule(css, selector), selector).toBe(true);
    }
  });

  it("keeps illustrations inside the phone viewport instead of forcing sideways scroll", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    for (const selector of [".family-hero-art img", ".pregnancy-care-art", ".memory-empty img"]) {
      const declarations = ruleBody(css, selector);
      expect(declarations, selector).toMatch(/width:\s*100%/);
      expect(declarations, selector).toMatch(/height:\s*auto/);
    }
  });

  it("lifts the offline banner above the bottom navigation and the home indicator", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const banner = ruleBody(css, ".connection-banner");

    expect(banner).toMatch(/position:\s*fixed/);
    expect(banner).toContain("env(safe-area-inset-bottom)");
  });

  it("hides the skip link until it receives keyboard focus", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(ruleBody(css, ".skip-link")).toMatch(/transform:\s*translateY\(-/);
    expect(ruleBody(css, ".skip-link:focus")).toMatch(/transform:\s*translateY\(0\)/);
  });

  it("supports keyboard focus, higher contrast and reduced motion", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media (prefers-contrast: more)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("@media (prefers-reduced-motion:reduce)");
  });

  it("offers an explicit logout action for a shared or lost phone", () => {
    render(<GuidePage />);

    const button = screen.getByRole("button", { name: "Đăng xuất khỏi EmBe" });
    expect(button.closest("form")).toHaveAttribute("action", "/api/auth/logout");
    expect(button.closest("form")).toHaveAttribute("method", "post");
  });
});
