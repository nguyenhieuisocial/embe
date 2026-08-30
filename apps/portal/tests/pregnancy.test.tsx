import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PregnancyPage from "../src/app/me-bau/page";
import { calculatePregnancyWeek } from "../src/lib/pregnancy";

describe("pregnancy week calculation", () => {
  it("uses the clinician-provided due date within a plausible pregnancy window", () => {
    expect(calculatePregnancyWeek("2026-10-08", new Date("2026-08-30T00:00:00Z"))).toBe(34);
    expect(calculatePregnancyWeek("2026-09-01", new Date("2026-08-30T00:00:00Z"))).toBe(39);
  });

  it("returns null for a missing, invalid or implausible due date", () => {
    expect(calculatePregnancyWeek("", new Date("2026-08-30T00:00:00Z"))).toBeNull();
    expect(calculatePregnancyWeek("not-a-date", new Date("2026-08-30T00:00:00Z"))).toBeNull();
    expect(calculatePregnancyWeek("2027-12-01", new Date("2026-08-30T00:00:00Z"))).toBeNull();
    expect(calculatePregnancyWeek("2025-01-01", new Date("2026-08-30T00:00:00Z"))).toBeNull();
  });
});

describe("pregnancy daily page", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T08:00:00+07:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows sourced daily actions, a seven-day menu and medical boundary", () => {
    render(<PregnancyPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Mẹ bầu hôm nay" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThanOrEqual(6);
    expect(screen.getByRole("heading", { name: "Thực đơn 7 ngày tham khảo" })).toBeInTheDocument();
    expect(screen.getByText(/không thay thế tư vấn/iu)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WHO/ })).toHaveAttribute("href", expect.stringContaining("who.int"));
  });

  it("keeps today's completion state on the device", () => {
    render(<PregnancyPage />);
    const firstTask = screen.getAllByRole("checkbox")[0];

    fireEvent.click(firstTask);

    expect(firstTask).toBeChecked();
    expect(localStorage.getItem("embe:pregnancy:checklist:2026-08-30")).toContain("supplements");
  });

  it("stores the due date locally and displays the calculated week", () => {
    render(<PregnancyPage />);
    fireEvent.change(screen.getByLabelText("Ngày dự sinh do bác sĩ xác nhận"), {
      target: { value: "2026-10-08" }
    });

    expect(screen.getByText("Tuần 34")).toBeInTheDocument();
    expect(localStorage.getItem("embe:pregnancy:due-date")).toBe("2026-10-08");
  });
});
