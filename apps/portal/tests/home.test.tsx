import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home, { dynamic } from "../src/app/page";

describe("family portal home", () => {
  it("returns the mobile shell immediately instead of blocking on timeline data", () => {
    expect(Home()).not.toBeInstanceOf(Promise);
  });

  it("always renders the latest approved timeline on the server", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("prioritizes four daily maternal actions and a short journal preview instead of a tool catalog", async () => {
    const { container } = render(await Home());

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Hôm nay"
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gần đây của nhà mình" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem toàn bộ nhật ký" })).toHaveAttribute("href", "/nhat-ky");
    const actions = screen.getByRole("navigation", { name: "Lối tắt hằng ngày" });
    expect(within(actions).getAllByRole("link")).toHaveLength(4);
    expect(within(actions).getByRole("link", { name: "Ghi bữa ăn" })).toHaveAttribute("href", "/me-bau/bua-an");
    expect(within(actions).getByRole("link", { name: "Ghi sức khỏe" })).toHaveAttribute("href", "/me-bau/suc-khoe");
    expect(within(actions).getByRole("link", { name: "Thuốc & vi chất" })).toHaveAttribute("href", "/me-bau/suc-khoe-iphone#vi-chat-thuoc");
    expect(within(actions).getByRole("link", { name: "Thêm giấy tờ" })).toHaveAttribute("href", "/me-bau/ho-so#them-giay-to");
    expect(container.querySelector(".family-hero-art")).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/studio"]')).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/huong-dan"]')).not.toBeInTheDocument();
  });

  it("requests a bounded preview and caps merged pending and published entries at three", () => {
    const source = readFileSync("src/app/page.tsx", "utf8");
    expect(source).toContain("getTimeline(3)");
    expect(source).toContain("getPendingJournalEntries(3)");
    expect(source).toMatch(/\.sort\([\s\S]*?\.slice\(0, 3\)/);
  });

  it("puts the current pregnancy stage before postnatal tools", async () => {
    render(await Home());

    expect(screen.getByText("Mới mang thai")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mình bắt đầu thật nhẹ nhàng" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở lịch gia đình" })).toHaveAttribute("href", "/lich");
    expect(screen.queryByText("Hỏi về giấc ngủ và bú sữa")).not.toBeInTheDocument();
  });

  it("keeps the home screen free of repeated privacy copy", async () => {
    render(await Home());

    expect(screen.queryByText("Ảnh, sức khỏe và nhật ký chỉ Mẹ Ngân và Ba Hiếu xem được."))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Được lưu giữ riêng tư cho gia đình.")).not.toBeInTheDocument();
  });
});
