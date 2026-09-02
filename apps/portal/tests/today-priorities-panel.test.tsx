import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import TodayPrioritiesPanel from "../src/components/today-priorities-panel";

describe("Today priorities panel", () => {
  it("renders three compact one-hand actions in priority order", () => {
    render(<TodayPrioritiesPanel priorities={[
      { id: "a", kind: "appointment", title: "Khám thai", detail: "10:00", href: "/lich", actionLabel: "Mở lịch" },
      { id: "b", kind: "medicine", title: "Vi chất theo đơn", detail: "08:00 · đến giờ", href: "/me-bau#thuoc-vi-chat", actionLabel: "Ghi đã dùng" },
      { id: "c", kind: "health", title: "Ghi sức khỏe", detail: "Một check-in ngắn", href: "/me-bau#suc-khoe", actionLabel: "Ghi nhanh" }
    ]} unavailableSources={[]} />);

    expect(screen.getByRole("heading", { name: "3 việc cần để ý" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Mở lịch: Khám thai" })).toHaveAttribute("href", "/lich");
  });

  it("distinguishes a source outage from a genuinely empty day", () => {
    const { rerender } = render(<TodayPrioritiesPanel priorities={[]} unavailableSources={["Lịch và việc"]} />);
    expect(screen.getByText("Chưa tải được Lịch và việc.")).toBeInTheDocument();
    expect(screen.queryByText("Hôm nay chưa có việc cần làm.")).not.toBeInTheDocument();

    rerender(<TodayPrioritiesPanel priorities={[]} unavailableSources={[]} />);
    expect(screen.getByText("Hôm nay chưa có việc cần làm.")).toBeInTheDocument();
  });
});
