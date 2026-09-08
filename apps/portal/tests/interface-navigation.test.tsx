import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const stage = vi.hoisted(() => ({ postpartum: false }));
vi.mock("../src/lib/use-family-stage", () => ({ useFamilyStage: () => stage }));
import FamilyToolDirectory, { familyToolGroups } from "../src/components/family-tool-directory";
import DailyShortcuts from "../src/components/daily-shortcuts";
import MaternalTools from "../src/components/maternal-tools";

describe("family interface organization", () => {
  it("keeps every tool on an existing page, no fabricated destinations", () => {
    for (const group of familyToolGroups) for (const tool of group.tools) {
      expect(existsSync(join(process.cwd(), "src/app", tool.href.split(/[?#]/)[0], "page.tsx")), tool.href).toBe(true);
    }
  });
  it("starts compact, searches without accents and resets cleanly", () => {
    const { container } = render(<FamilyToolDirectory />);
    expect(container.querySelectorAll("details[open]")).toHaveLength(0);
    const input = screen.getByRole("searchbox", { name: "Tìm công cụ" });
    fireEvent.change(input, { target: { value: "thuoc" } });
    expect(screen.getByRole("link", { name: /Thuốc & vi chất/ })).toHaveAttribute("href", "/me-bau/suc-khoe-iphone#vi-chat-thuoc");
    expect(screen.queryByRole("link", { name: /Ngân sách/ })).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "ngan sach" } });
    expect(screen.getByRole("link", { name: /Ngân sách & chi tiêu/ })).toHaveAttribute("href", "/ngan-sach");
    fireEvent.change(input, { target: { value: "xyz-no-such-tool" } });
    expect(screen.getByRole("status")).toHaveTextContent("Chưa tìm thấy");
    fireEvent.click(screen.getByRole("button", { name: "Xóa tìm kiếm công cụ" }));
    expect(input).toHaveValue("");
    expect(container.querySelectorAll("details[open]")).toHaveLength(0);
  });
  it("keeps4 meaningful daily actions in each life stage, not Studio", () => {
    stage.postpartum = false;
    const { rerender } = render(<DailyShortcuts />);
    const nav = screen.getByRole("navigation", { name: "Lối tắt hằng ngày" });
    expect(within(nav).getAllByRole("link")).toHaveLength(4);
    expect(within(nav).getByRole("link", { name: "Ghi bữa ăn" })).toHaveAttribute("href", "/me-bau/bua-an");
    stage.postpartum = true; rerender(<DailyShortcuts />);
    expect(within(nav).getAllByRole("link")).toHaveLength(4);
    expect(within(nav).getByRole("link", { name: "Ghi cữ bú" })).toHaveAttribute("href", "/be?quick=feeding");
    stage.postpartum = false;
  });
  it("keeps late-pregnancy tools away from early daily actions without hiding help", () => {
    const { rerender } = render(<MaternalTools week={8} />);
    expect(screen.queryByRole("link", { name: "Thai máy" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Khi cần trợ giúp" })).toHaveAttribute("href", "#can-lien-he");
    expect(within(screen.getByRole("navigation", { name: "Công cụ hằng ngày" })).getAllByRole("link")).toHaveLength(4);
    rerender(<MaternalTools week={30} />);
    expect(screen.getByRole("link", { name: "Thai máy" })).toHaveAttribute("href", "/me-bau/thai-may");
  });
  it("caps Home history and does not mount maternity quick capture in Studio", () => {
    const home = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
    expect(home).toContain(".slice(0, 3)");
    expect(home).not.toContain('href: "/studio"');
    const shell = readFileSync(join(process.cwd(), "src/components/app-shell.tsx"), "utf8");
    expect(shell).toContain('!isStudio && <><DeviceAccessPrompt /><QuickActions');
  });
});
