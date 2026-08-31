import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home, { dynamic } from "../src/app/page";

describe("family portal home", () => {
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
    expect(screen.getByRole("heading", { name: "Khoảnh khắc" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở album kỷ niệm" })).toHaveAttribute("href", "/ky-niem");
    expect(screen.getByRole("link", { name: "Mở trang Mẹ bầu hôm nay" })).toHaveAttribute(
      "href",
      "/me-bau"
    );
    expect(screen.getByRole("link", { name: "Xem cách sử dụng đơn giản" })).toHaveAttribute(
      "href",
      "/huong-dan"
    );
  });

  it("explains that the portal is private and contains only family-approved content", async () => {
    render(await Home());

    expect(
      screen.getByText("Chỉ những điều bố mẹ đã chọn mới xuất hiện tại đây.")
    ).toBeInTheDocument();
  });
});
