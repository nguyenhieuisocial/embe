import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PregnancyChapter from "../src/components/pregnancy-chapter";
import QuickActions from "../src/components/quick-actions";

describe("canonical pregnancy due date", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    // Keep the pregnancy chapter fixture at the same gestational stage.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-07T10:00:00+07:00"));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("uses the server profile on a new phone and keeps it as offline fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      dueDate: "2026-12-01", completed: [], hasProfile: true, hasDayState: false
    })));

    render(<PregnancyChapter />);

    await waitFor(() => expect(screen.getByText(/Tuần \d+/)).toBeInTheDocument());
    expect(localStorage.getItem("embe:pregnancy:due-date")).toBe("2026-12-01");
  });

  it("offers useful quick actions on a new phone without waiting for a due-date request", () => {
    vi.stubGlobal("fetch", vi.fn());

    render(<QuickActions />);
    fireEvent.click(screen.getByRole("button", { name: "Mở thao tác nhanh" }));

    expect(screen.queryByRole("link", { name: /Cài giai đoạn thai kỳ/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ghi sức khỏe/ })).toHaveAttribute("href", "/me-bau/suc-khoe");
    expect(screen.getByRole("link", { name: /Ghi bữa ăn/ })).toHaveAttribute("href", "/me-bau/bua-an");
    expect(fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem("embe:pregnancy:due-date")).toBeNull();
  });

  it("retains the last saved date when the server is temporarily unavailable", async () => {
    localStorage.setItem("embe:pregnancy:due-date", "2026-12-01");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<PregnancyChapter />);

    await waitFor(() => expect(screen.getByText(/Tuần \d+/)).toBeInTheDocument());
    expect(localStorage.getItem("embe:pregnancy:due-date")).toBe("2026-12-01");
  });
});
