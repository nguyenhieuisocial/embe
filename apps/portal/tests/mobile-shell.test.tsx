import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import FamilyNav from "../src/components/family-nav";

describe("mobile family shell", () => {
  it("offers the three everyday destinations as a compact navigation", () => {
    render(<FamilyNav />);

    expect(screen.getByRole("navigation", { name: "Điều hướng gia đình" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hôm nay" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Mẹ Ngân" })).toHaveAttribute("href", "/me-bau");
    expect(screen.getByRole("link", { name: "Cách dùng" })).toHaveAttribute("href", "/huong-dan");
  });

  it("reserves iPhone safe areas and prevents password-field zoom", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(/\.login-form input\[type="password"\][^{]*\{[^}]*font-size:\s*(?:1rem|16px)/s);
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("env(safe-area-inset-left)");
    expect(css).toContain("env(safe-area-inset-right)");
  });
});
