import { act, fireEvent, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PregnancyPage from "../src/app/me-bau/page";
import { calculatePregnancyWeek, localDateKey } from "../src/lib/pregnancy";

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
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json({
          dueDate: body.dueDate ?? null,
          completed: body.completed ?? [],
          hasProfile: Object.hasOwn(body, "dueDate"),
          hasDayState: Object.hasOwn(body, "completed")
        });
      }
      return Response.json({ dueDate: null, completed: [], hasProfile: false, hasDayState: false });
    }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T08:00:00+07:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  it("hydrates private state saved by another signed-in device", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      dueDate: "2026-10-08",
      completed: ["supplements"],
      hasProfile: true,
      hasDayState: true
    }));

    render(<PregnancyPage />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByLabelText("Ngày dự sinh do bác sĩ xác nhận")).toHaveValue("2026-10-08");
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
    expect(screen.getByText("Đã đồng bộ riêng tư")).toBeInTheDocument();
  });

  it("keeps a local dirty copy when the backend is temporarily unavailable", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    render(<PregnancyPage />);

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(localStorage.getItem("embe:pregnancy:checklist:2026-08-30:dirty")).toBe("1");
    expect(screen.getByText(/sẽ đồng bộ khi có mạng/i)).toBeInTheDocument();
  });

  it("hydrates without a date mismatch when midnight passes between server and iPhone", async () => {
    vi.setSystemTime(new Date("2026-08-30T23:59:59+07:00"));
    const serverHtml = renderToString(<PregnancyPage />);
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    vi.setSystemTime(new Date("2026-08-31T00:00:01+07:00"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <PregnancyPage />);
    });

    expect(consoleError).not.toHaveBeenCalled();
    expect(container).toHaveTextContent(`CHECKLIST ${localDateKey(new Date())}`);
    await act(async () => root?.unmount());
    consoleError.mockRestore();
    container.remove();
  });
});
