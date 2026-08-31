import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import FamilyCalendar from "../src/components/family-calendar";
import { calendarMonth, dateKey, lunarDateLabel } from "../src/lib/calendar";

describe("Vietnamese family calendar", () => {
  it("uses the Vietnamese lunar date for Tet", () => {
    expect(lunarDateLabel(new Date(2026, 1, 17))).toBe("1/1");
  });

  it("normalizes the selected month without accepting malformed input", () => {
    expect(calendarMonth("2026-08")).toEqual({ month: 8, year: 2026 });
    expect(calendarMonth("2026-13", new Date(2026, 7, 30))).toEqual({ month: 8, year: 2026 });
  });

  it("renders a complete month grid and links a date to its memories", () => {
    const selected = new Date(2026, 7, 30);
    render(
      <FamilyCalendar
        month={8}
        year={2026}
        selectedDate={selected}
        memoryCounts={{ [dateKey(selected)]: 2 }}
        taskCounts={{ [dateKey(selected)]: { completed: 1, total: 3 } }}
      />
    );

    expect(screen.getAllByRole("link", { name: /Xem ngày/ })).toHaveLength(42);
    expect(screen.getByRole("link", { name: /Xem ngày 30 tháng 8 năm 2026.*2 kỷ niệm.*1 trên 3 việc/ }))
      .toHaveAttribute("href", "/ke-hoach?date=2026-08-30");
    expect(screen.getByText("18/7")).toBeInTheDocument();
  });
});
