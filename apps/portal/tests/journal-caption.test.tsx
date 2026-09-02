import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import JournalCaption from "../src/components/journal-caption";

describe("journal caption", () => {
  it("turns an EmBe check-in into a safe Google Maps link", () => {
    render(
      <JournalCaption caption={
        "Buổi chiều cả nhà đi dạo.\n\n📍 [Công viên gần nhà](https://www.google.com/maps/search/?api=1&query=10.7769%2C106.7009)"
      } />
    );

    expect(screen.getByText("Buổi chiều cả nhà đi dạo.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Công viên gần nhà" })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=10.7769%2C106.7009"
    );
  });

  it("keeps arbitrary markdown as text instead of creating an unsafe link", () => {
    render(<JournalCaption caption="📍 [Bấm vào đây](https://evil.example/collect)" />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("📍 [Bấm vào đây](https://evil.example/collect)")).toBeInTheDocument();
  });

  it("never shows the private synchronization marker or trailing encoded space", () => {
    render(
      <JournalCaption caption={
        "Một ngày thật vui.\n<!-- embe-journal:cc0cd7c4-156f-44d5-818b-53962b699555 -->\n&#x20;"
      } />
    );

    expect(screen.getByText("Một ngày thật vui.")).toBeInTheDocument();
    expect(screen.queryByText(/embe-journal|&#x20;/i)).not.toBeInTheDocument();
  });
});
