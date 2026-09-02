import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PregnancyChapter from "../src/components/pregnancy-chapter";
import QuickActions from "../src/components/quick-actions";

describe("canonical pregnancy due date", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("uses the server profile on a new phone and keeps it as offline fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      dueDate: "2026-12-01", completed: [], hasProfile: true, hasDayState: false
    })));

    render(<PregnancyChapter />);

    await waitFor(() => expect(screen.getByText(/Tuần \d+/)).toBeInTheDocument());
    expect(localStorage.getItem("embe:pregnancy:due-date")).toBe("2026-12-01");
  });

  it("shows the correct quick action without opening pregnancy settings first", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      dueDate: "2026-12-01", completed: [], hasProfile: true, hasDayState: false
    })));

    render(<QuickActions />);
    await waitFor(() => expect(localStorage.getItem("embe:pregnancy:due-date")).toBe("2026-12-01"));
    fireEvent.click(screen.getByRole("button", { name: "Mở thao tác nhanh" }));

    expect(screen.queryByRole("link", { name: /Cài giai đoạn thai kỳ/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Lưu sức khỏe hôm nay/ })).toBeInTheDocument();
  });

  it("retains the last saved date when the server is temporarily unavailable", async () => {
    localStorage.setItem("embe:pregnancy:due-date", "2026-12-01");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<PregnancyChapter />);

    await waitFor(() => expect(screen.getByText(/Tuần \d+/)).toBeInTheDocument());
    expect(localStorage.getItem("embe:pregnancy:due-date")).toBe("2026-12-01");
  });
});
