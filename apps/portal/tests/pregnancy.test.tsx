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
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/pregnancy/health")) {
        if (init?.method === "PATCH") {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          return Response.json({ metric: { ...body, checklistPercent: 0 } });
        }
        return Response.json({ history: [] });
      }
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
    expect(screen.getByText("Đã ăn sáng")).toBeInTheDocument();
    expect(screen.getByText("Đã ăn trưa")).toBeInTheDocument();
    expect(screen.getByText("Đã ăn tối")).toBeInTheDocument();
    expect(screen.getByText("Có rau hoặc quả trong ngày")).toBeInTheDocument();
    expect(screen.getByText("Có nguồn đạm trong ngày")).toBeInTheDocument();
    expect(screen.getByText("Uống nước đều trong ngày")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(13);
    expect(screen.getByRole("heading", { level: 3, name: "Ăn uống" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Chăm cơ thể" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thực đơn 7 ngày tham khảo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nên ăn gì, hạn chế gì, kiêng gì?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nên ưu tiên" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nên hạn chế" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nên tránh" })).toBeInTheDocument();
    expect(screen.getByText("Ăn chín, tách sống – chín")).toBeInTheDocument();
    expect(screen.getByText("Caffeine không quá 200 mg mỗi ngày")).toBeInTheDocument();
    expect(screen.getByText("Không rượu bia")).toBeInTheDocument();
    expect(screen.getByText("Không tự dùng thuốc, thảo dược hoặc vi chất")).toBeInTheDocument();
    expect(screen.getByText(/Không cần “kiêng” mọi món theo truyền miệng/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Điều nên ưu tiên theo giai đoạn" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nhật ký sức khỏe" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Biểu đồ 28 ngày" })).toBeInTheDocument();
    expect(screen.getByText("Chưa có số liệu sức khỏe")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Khi nào cần liên hệ ngay" })).toBeInTheDocument();
    expect(screen.getByText(/không thay thế tư vấn/iu)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WHO/ })).toHaveAttribute("href", expect.stringContaining("who.int"));
    expect(screen.getAllByRole("link", { name: /ACOG/ })[0]).toHaveAttribute("href", expect.stringContaining("acog.org"));
  });

  it("saves one bounded daily health snapshot from simple mobile fields", async () => {
    render(<PregnancyPage />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.change(screen.getByLabelText("Cân nặng (kg)"), { target: { value: "56.4" } });
    fireEvent.change(screen.getByLabelText("Huyết áp tâm thu"), { target: { value: "112" } });
    fireEvent.change(screen.getByLabelText("Huyết áp tâm trương"), { target: { value: "72" } });
    fireEvent.change(screen.getByLabelText("Giấc ngủ (giờ)"), { target: { value: "7.5" } });
    fireEvent.change(screen.getByLabelText("Số cốc nước"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Vận động (phút)"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Khá ổn" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu sức khỏe hôm nay" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetch).toHaveBeenCalledWith("/api/pregnancy/health", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({
        day: "2026-08-30",
        weightKg: 56.4,
        systolic: 112,
        diastolic: 72,
        sleepMinutes: 450,
        waterGlasses: 7,
        movementMinutes: 25,
        wellbeing: 4
      })
    }));
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
    vi.mocked(fetch).mockImplementation(async (input) => String(input).includes("/api/pregnancy/health")
      ? Response.json({ history: [] })
      : Response.json({
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
