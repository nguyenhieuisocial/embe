import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/me-bau" }));

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
  it("keeps four destinations around the central quick action", () => {
    render(<FamilyNav />);

    expect(screen.getByRole("navigation", { name: "Điều hướng gia đình" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hôm nay" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Mẹ bầu" })).toHaveAttribute("href", "/me-bau");
    expect(screen.getByRole("link", { name: "Mẹ bầu" })).toHaveAttribute("aria-current", "page");
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

    expect(css).toContain("--control: 48px");
    expect(css).toContain("--paper: #FFF7FA");
    expect(css).toContain("--rose: #96405F");
    expect(ruleBody(css, ".eyebrow, .panel-kicker")).toMatch(/text-transform:\s*none/);
    expect(ruleBody(css, ".btn")).toMatch(/min-height:\s*var\(--control\)/);
    expect(ruleBody(css, ".btn")).toMatch(/border-radius:\s*var\(--radius-md\)/);
    expect(ruleBody(css, ".family-nav")).toMatch(/bottom:\s*0/);
    expect(ruleBody(css, '.family-nav a[aria-current="page"] .nav-icon')).toMatch(/background:\s*var\(--jade-soft\)/);
    expect(css).toMatch(/button,\s*\n?\s*\[role="button"\][^{]*\{[^}]*-webkit-tap-highlight-color:\s*transparent/s);
    expect(ruleBody(css, ":focus-visible")).toMatch(/outline:\s*3px solid var\(--sun\)/);
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*\.has-nav:has\([\s\S]*\) \.family-nav,[\s\S]*\.has-nav:has\([\s\S]*\) \.quick-trigger\s*\{\s*display:\s*none/s);
    expect(css).toContain('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):focus');
    expect(ruleBody(css, '.journal-form > button[type="submit"]')).toMatch(/position:\s*sticky/);
    expect(css).toMatch(/input\[type="month"\],[\s\S]*textarea\s*\{[^}]*border-radius:\s*var\(--radius-sm\)/s);
    expect(ruleBody(css, ".meal-camera:has(input:focus-visible)")).toMatch(/outline:\s*3px solid var\(--sun\)/);
  });

  it("stacks dense form rows on phones instead of squeezing two fields together", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(/@media \(max-width: 480px\)[\s\S]*\.planner-form-row,[\s\S]*\.inventory-form-row\s*\{[^}]*grid-template-columns:\s*1fr/s);
  });

  it("reserves the Today priorities height while private data is streaming", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(ruleBody(css, ".today-priorities.skeleton")).toMatch(/min-height:\s*27[0-9]px/);
  });

  it("does not preload unused Vietnamese font ranges before private content", () => {
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");

    expect(layout.match(/preload:\s*false/g)).toHaveLength(2);
  });

  it("gives compact text links a full iPhone touch target", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(/\.wordmark\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.rhythm-item a[^\{]*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.source-section a\s*\{[^}]*min-height:\s*44px/s);
    expect(ruleBody(css, ".app-store-link")).toMatch(/min-height:\s*44px/);
    expect(ruleBody(css, ".stage-nutrition-sources a")).toMatch(/min-height:\s*44px/);
    expect(ruleBody(css, ".safety-search-box input")).toMatch(/min-height:\s*44px/);
    expect(ruleBody(css, ".safety-search-box button")).toMatch(/height:\s*44px/);
    expect(ruleBody(css, ".safety-search-chips button")).toMatch(/min-width:\s*44px/);
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*\.family-calendar[^{]*\{[^}]*margin-inline:\s*calc\(-1 \* var\(--gutter\)\)/s);
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
      ".today-hero",
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

    for (const selector of [".memory-empty img"]) {
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
