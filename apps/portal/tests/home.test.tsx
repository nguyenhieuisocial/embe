import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "../src/app/page";

describe("family portal home", () => {
  it("shows the family timeline and gallery as the two primary destinations", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Một nơi để cả nhà cùng dõi theo hành trình của em bé"
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nhật ký" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Khoảnh khắc" })).toBeInTheDocument();
  });

  it("explains that the portal is private and contains only family-approved content", () => {
    render(<Home />);

    expect(
      screen.getByText("Chỉ những điều bố mẹ đã chọn mới xuất hiện tại đây.")
    ).toBeInTheDocument();
  });
});

