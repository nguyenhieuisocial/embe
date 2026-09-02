import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PregnancyPage from "../src/app/me-bau/page";
import { calculatePregnancyWeek, estimateDueDateFromLmp, localDateKey } from "../src/lib/pregnancy";

function openHealthInsights() {
  const details = screen.getByText("Xem biểu đồ và lịch sử").closest("details");
  if (!details) throw new Error("Health insights details not found");
  details.open = true;
  fireEvent(details, new Event("toggle"));
}

describe("pregnancy week calculation", () => {
  it("uses the clinician-provided due date within a plausible pregnancy window", () => {
    expect(calculatePregnancyWeek("2026-10-08", new Date("2026-08-30T00:00:00Z"))).toBe(34);
    expect(calculatePregnancyWeek("2026-09-01", new Date("2026-08-30T00:00:00Z"))).toBe(39);
  });

  it("estimates a due date from the first day of the last period and cycle length", () => {
    expect(estimateDueDateFromLmp("2026-01-01", 28)).toBe("2026-10-08");
    expect(estimateDueDateFromLmp("2026-01-01", 30)).toBe("2026-10-10");
    expect(estimateDueDateFromLmp("2026-02-30", 28)).toBeNull();
    expect(estimateDueDateFromLmp("2026-01-01", 60)).toBeNull();
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
    expect(screen.getByText("Cài đặt giai đoạn")).toBeInTheDocument();
    expect(screen.getByText("Giai đoạn hiện tại")).toBeInTheDocument();
    expect(screen.getByText("Mới mang thai")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Đi nhanh trong trang Mẹ bầu" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hôm nay" })).toHaveAttribute("href", "#viec-hom-nay");
    expect(screen.getByRole("link", { name: /Hồ sơ thai kỳ/i })).toHaveAttribute("href", "/me-bau/ho-so");
    expect(screen.getByRole("heading", { name: "Có dấu hiệu bất thường?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem ngay" })).toHaveAttribute("href", "#can-lien-he");
    expect(screen.getByText("Đã ăn sáng")).toBeInTheDocument();
    expect(screen.getByText("Đã ăn trưa")).toBeInTheDocument();
    expect(screen.getByText("Đã ăn tối")).toBeInTheDocument();
    expect(screen.getByText("Có rau hoặc quả trong ngày")).toBeInTheDocument();
    expect(screen.getByText("Có nguồn đạm trong ngày")).toBeInTheDocument();
    expect(screen.getByText("Uống nước đều trong ngày")).toBeInTheDocument();
    const dailyBoard = document.querySelector<HTMLElement>("#viec-hom-nay");
    expect(dailyBoard && within(dailyBoard).getAllByRole("checkbox")).toHaveLength(13);
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
    const stageNutrition = screen.getByRole("region", { name: "Ăn uống theo giai đoạn" });
    expect(within(stageNutrition).getByRole("heading", { name: "Ăn uống theo giai đoạn" })).toBeInTheDocument();
    expect(within(stageNutrition).getByText("Món dễ bắt đầu")).toBeInTheDocument();
    expect(within(stageNutrition).getAllByText("Đồ uống")).toHaveLength(3);
    expect(within(stageNutrition).getByText("Khi đang nghén")).toBeInTheDocument();
    expect(within(stageNutrition).getByText(/5–6 bữa nhỏ/i)).toBeInTheDocument();
    expect(within(stageNutrition).getByText(/nước lọc từng ngụm/i)).toBeInTheDocument();
    expect(within(stageNutrition).getByText(/đạm.*sắt.*canxi.*choline/i)).toBeInTheDocument();
    expect(within(stageNutrition).getByText(/chia thành bữa nhỏ/i)).toBeInTheDocument();
    expect(within(stageNutrition).getByText("Quy tắc an toàn áp dụng suốt thai kỳ")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nhật ký sức khỏe" })).toBeInTheDocument();
    expect(screen.getByLabelText("Đường huyết (mg/dL)")).toBeInTheDocument();
    expect(screen.getByLabelText("Số cử động thai")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Dấu hiệu cần ghi lại" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Biểu đồ 28 ngày" })).not.toBeInTheDocument();
    openHealthInsights();
    expect(screen.getByRole("heading", { name: "Biểu đồ 28 ngày" })).toBeInTheDocument();
    expect(screen.getByText("Chưa có số liệu sức khỏe")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Khi nào cần liên hệ ngay" })).toBeInTheDocument();
    expect(screen.getByText(/không thay thế tư vấn/iu)).toBeInTheDocument();
    const sources = screen.getByText("Nguồn đã đối chiếu").closest("details");
    expect(sources).not.toHaveAttribute("open");
    if (sources) fireEvent.click(within(sources).getByText("Nguồn đã đối chiếu"));
    expect(screen.getByRole("link", { name: /WHO/ })).toHaveAttribute("href", expect.stringContaining("who.int"));
    expect(screen.getAllByRole("link", { name: /ACOG/ })[0]).toHaveAttribute("href", expect.stringContaining("acog.org"));
  });

  it("puts frequent daily actions before occasional records and reference content", () => {
    render(<PregnancyPage />);
    expect(screen.queryByRole("img", { name: /nước uống, bữa ăn chín/i })).not.toBeInTheDocument();
    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent ?? "");
    const position = (name: string) => headings.findIndex((heading) => heading.includes(name));
    expect(position("Việc của hôm nay")).toBeLessThan(position("Ăn uống theo giai đoạn"));
    expect(position("Ăn uống theo giai đoạn")).toBeLessThan(position("Thuốc, vi chất & dinh dưỡng"));
    expect(position("Thuốc, vi chất & dinh dưỡng")).toBeLessThan(position("Nhật ký bữa ăn"));
    expect(position("Nhật ký bữa ăn")).toBeLessThan(position("Nhật ký sức khỏe"));
    expect(position("Nhật ký sức khỏe")).toBeLessThan(position("Hồ sơ khám thai"));
    expect(position("Hồ sơ khám thai")).toBeLessThan(position("Nên ăn gì, hạn chế gì, kiêng gì?"));
  });

  it("exposes iPhone health import before the long daily content", () => {
    render(<PregnancyPage />);

    const jump = screen.getByRole("navigation", { name: "Đi nhanh trong trang Mẹ bầu" });
    expect(within(jump).getAllByRole("link")).toHaveLength(4);
    expect(within(jump).getByRole("link", { name: "Sức khỏe" })).toHaveAttribute("href", "#suc-khoe");
    expect(within(jump).getByRole("link", { name: "Hồ sơ" })).toHaveAttribute("href", "/me-bau/ho-so");

    const entry = screen.getByRole("link", { name: /Sức khỏe từ iPhone/i });
    const dailyBoard = document.querySelector<HTMLElement>("#viec-hom-nay");
    expect(entry).toHaveAttribute("href", "#suc-khoe-iphone");
    expect(dailyBoard).not.toBeNull();
    expect(entry.compareDocumentPosition(dailyBoard as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: "Nhập nhanh hôm nay" })).toHaveAttribute("href", "#suc-khoe");
    expect(screen.queryByText(/được gửi tự động mỗi ngày/i)).not.toBeInTheDocument();
  });

  it("keeps the mobile day compact and opens deeper information only when requested", () => {
    render(<PregnancyPage />);

    expect(screen.getByRole("progressbar", { name: "Tiến độ việc hôm nay" })).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByRole("heading", { level: 3, name: "Ăn uống" }).closest("details")).toHaveAttribute("open");
    expect(screen.getByRole("heading", { level: 3, name: "Chăm cơ thể" }).closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Xem biểu đồ và lịch sử").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "Nên ăn gì, hạn chế gì, kiêng gì?" }).closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "Thực đơn 7 ngày tham khảo" }).closest("details")).not.toHaveAttribute("open");
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
    fireEvent.change(screen.getByLabelText("Đường huyết (mg/dL)"), { target: { value: "92" } });
    fireEvent.change(screen.getByLabelText("Thời điểm đo đường huyết"), { target: { value: "fasting" } });
    fireEvent.change(screen.getByLabelText("Số cử động thai"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Đau đầu nhiều" }));
    fireEvent.change(screen.getByLabelText("Ghi chú sức khỏe hôm nay"), { target: { value: "Hơi chóng mặt sau khi ngủ dậy." } });
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
        wellbeing: 4,
        bloodGlucoseMgDl: 92,
        fetalMovementCount: 8,
        symptoms: ["severe_headache"],
        glucoseContext: "fasting",
        healthNote: "Hơi chóng mặt sau khi ngủ dậy."
      })
    }));
    expect(screen.queryByRole("button", { name: "Lưu sức khỏe hôm nay" })).not.toBeInTheDocument();
    expect(screen.getByText("Đã lưu sức khỏe hôm nay")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sửa thông tin hôm nay" })).toBeInTheDocument();
    openHealthInsights();
    expect(screen.getByRole("heading", { name: "Lịch sử sức khỏe chi tiết" })).toBeInTheDocument();
  });

  it("stops an incomplete blood-pressure pair before sending private data", async () => {
    render(<PregnancyPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    vi.mocked(fetch).mockClear();

    fireEvent.change(screen.getByLabelText("Huyết áp tâm thu"), { target: { value: "112" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu sức khỏe hôm nay" }));

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/cần nhập đủ cả hai số huyết áp/i)).toBeInTheDocument();
  });

  it("builds a compact seven-day visit brief from real entries", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => String(input).includes("/api/pregnancy/health")
      ? Response.json({ history: [
          { day: "2026-08-29", weightKg: 55.8, systolic: 110, diastolic: 70, sleepMinutes: 420, waterGlasses: 6, movementMinutes: 20, wellbeing: 3, bloodGlucoseMgDl: null, fetalMovementCount: null, symptoms: [], glucoseContext: null, healthNote: "", checklistPercent: 70 },
          { day: "2026-08-30", weightKg: 56.4, systolic: 112, diastolic: 72, sleepMinutes: 450, waterGlasses: 7, movementMinutes: 25, wellbeing: 4, bloodGlucoseMgDl: 92, fetalMovementCount: 8, symptoms: ["severe_headache"], glucoseContext: "fasting", healthNote: "Đau đầu buổi sáng.", checklistPercent: 80 }
        ] })
      : Response.json({ dueDate: null, completed: [], hasProfile: false, hasDayState: false }));

    render(<PregnancyPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    openHealthInsights();
    const brief = screen.getByRole("heading", { name: "Tóm tắt 7 ngày để đi khám" }).closest("section");
    expect(brief).not.toBeNull();
    if (!brief) return;
    expect(within(brief).getByText("2 ngày có số liệu")).toBeInTheDocument();
    expect(within(brief).getByText(/Đau đầu nhiều/)).toBeInTheDocument();
    expect(within(brief).getByRole("button", { name: "Sao chép tóm tắt" })).toBeInTheDocument();
  });

  it("does not overwrite a health value typed while the private history is loading", async () => {
    let finishHealthLoad: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).includes("/api/pregnancy/health") && !init?.method) {
        return new Promise<Response>((resolve) => { finishHealthLoad = resolve; });
      }
      if (String(input).includes("/api/pregnancy")) {
        return Response.json({ dueDate: null, completed: [], hasProfile: false, hasDayState: false });
      }
      return Response.json({});
    });

    render(<PregnancyPage />);
    fireEvent.change(screen.getByLabelText("Cân nặng (kg)"), { target: { value: "57.2" } });
    expect(finishHealthLoad).toBeTypeOf("function");
    await act(async () => {
      finishHealthLoad?.(Response.json({
        history: [{ day: "2026-08-30", weightKg: 55, systolic: null, diastolic: null, sleepMinutes: null, waterGlasses: null, movementMinutes: null, wellbeing: null, checklistPercent: 0 }]
      }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByLabelText("Cân nặng (kg)")).toHaveValue(57.2);
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
    fireEvent.change(screen.getByLabelText("Ngày dự sinh (bác sĩ xác nhận)"), {
      target: { value: "2026-10-08" }
    });

    expect(screen.getByText("Tuần 34")).toBeInTheDocument();
    expect(screen.getByText("Ba tháng cuối", { selector: ".stage-name" })).toBeInTheDocument();
    expect(localStorage.getItem("embe:pregnancy:due-date")).toBe("2026-10-08");
  });

  it("lets the family explicitly adopt an LMP estimate without replacing a clinician date silently", () => {
    render(<PregnancyPage />);
    fireEvent.change(screen.getByLabelText("Ngày đầu kỳ kinh cuối"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Độ dài chu kỳ"), { target: { value: "30" } });

    expect(screen.getByText("Ngày ước tính: 10/10/2026")).toBeInTheDocument();
    expect(screen.getByLabelText("Ngày dự sinh (bác sĩ xác nhận)")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Dùng ngày ước tính" }));
    expect(screen.getByLabelText("Ngày dự sinh (bác sĩ xác nhận)")).toHaveValue("2026-10-10");
    expect(localStorage.getItem("embe:pregnancy:due-date")).toBe("2026-10-10");
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

    expect(screen.getByLabelText("Ngày dự sinh (bác sĩ xác nhận)")).toHaveValue("2026-10-08");
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
    expect(container).toHaveTextContent(`Checklist ${localDateKey(new Date())}`);
    await act(async () => root?.unmount());
    consoleError.mockRestore();
    container.remove();
  });
});
