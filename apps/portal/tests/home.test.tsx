import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home, { dynamic } from "../src/app/page";

describe("family portal home", () => {
  it("returns the mobile shell immediately instead of blocking on timeline data", () => {
    expect(Home()).not.toBeInstanceOf(Promise);
  });

  it("always renders the latest approved timeline on the server", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("shows the family timeline and gallery as the two primary destinations", async () => {
    const { container } = render(await Home());

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Hôm nay"
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nhật ký" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem toàn bộ nhật ký" })).toHaveAttribute("href", "/nhat-ky");
    expect(screen.getByRole("heading", { name: "Mở nhanh" })).toBeInTheDocument();
    expect(container.querySelector(".family-hero-art")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở album kỷ niệm" })).toHaveAttribute("href", "/ky-niem");
    expect(screen.getByRole("link", { name: "Xem cách sử dụng đơn giản" })).toHaveAttribute(
      "href",
      "/huong-dan"
    );
    expect(screen.getByRole("link", { name: "Hỏi trợ lý riêng của gia đình" })).toHaveAttribute(
      "href",
      "/tro-ly"
    );
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
