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
    render(await Home());

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Hôm nay, mình cần làm gì?"
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nhật ký" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở album kỷ niệm" })).toHaveAttribute("href", "/ky-niem");
    expect(screen.getByRole("link", { name: "Mở kế hoạch hôm nay" })).toHaveAttribute("href", "/ke-hoach");
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

  it("explains that the portal is private and contains only family-approved content", async () => {
    render(await Home());

    expect(
      screen.getByText("Chỉ những điều bố mẹ đã chọn mới xuất hiện tại đây.")
    ).toBeInTheDocument();
  });
});
