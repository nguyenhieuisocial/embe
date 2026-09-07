import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BirthTransition from "../src/components/birth-transition";
import { clearPrivateGetCache } from "../src/lib/private-get-cache";
import { dateInVietnam } from "../src/lib/family-task-contract";

const emptyRecord = {
  birthOccurredAt: null, birthMethod: null, babySex: null, gestationalWeeks: null, gestationalDays: null,
  birthWeightG: null, birthLengthCm: null, birthHeadCm: null, birthFacility: null,
  birthClinician: null, premature: false, lowBirthWeight: false, specialMonitoring: false,
  specialMonitoringNotes: null, dischargedAt: null, dischargeNotes: null, hasBirthRecord: false
};

describe("birth transition", () => {
  beforeEach(() => {
    localStorage.clear();
    clearPrivateGetCache();
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return Response.json({ ...emptyRecord, ...body, hasBirthRecord: true });
      }
      return Response.json(emptyRecord);
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("saves the birth event and announces the postpartum transition", async () => {
    render(<BirthTransition dueDate={dateInVietnam()} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByText("Em bé đã chào đời?"));
    fireEvent.change(screen.getByLabelText("Ngày và giờ sinh"), { target: { value: "2026-08-30T15:15" } });
    fireEvent.change(screen.getByLabelText("Hình thức sinh"), { target: { value: "vaginal" } });
    fireEvent.change(screen.getByLabelText("Giới tính của Bé"), { target: { value: "female" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin sinh" }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(fetch).toHaveBeenLastCalledWith("/api/family/lifecycle", expect.objectContaining({ method: "PATCH" }));
    expect(screen.getByRole("status")).toHaveTextContent("chuyển sang chế độ sau sinh");
    expect(screen.getByRole("link", { name: "Ghi hồi phục của Mẹ" })).toHaveAttribute("href", "/me");
    expect(screen.getByRole("link", { name: "Bắt đầu cữ bú đầu tiên" })).toHaveAttribute("href", "/be?quick=feeding");
    expect(localStorage.getItem("embe:family:birth-occurred-at")).toContain("2026-08-30");
    const request = vi.mocked(fetch).mock.calls.at(-1)?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({ babySex: "female" });
  });

  it("does not flash the prompt while loading or without a due date", async () => {
    const { container } = render(<BirthTransition />);
    expect(container).toBeEmptyDOMElement();
    await act(async () => { await Promise.resolve(); });
    expect(container).toBeEmptyDOMElement();
  });

  it("hides early pregnancy and updates when the due date changes", async () => {
    const earlyDue = new Date(); earlyDue.setDate(earlyDue.getDate() + 210);
    const { rerender } = render(<BirthTransition dueDate={dateInVietnam(earlyDue)} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText("Em bé đã chào đời?")).not.toBeInTheDocument();
    rerender(<BirthTransition dueDate={dateInVietnam()} />);
    expect(screen.getByText("Em bé đã chào đời?")).toBeInTheDocument();
    rerender(<BirthTransition dueDate={dateInVietnam(earlyDue)} />);
    expect(screen.queryByText("Em bé đã chào đời?")).not.toBeInTheDocument();
  });

  it("keeps an explicit early-birth entry in settings", async () => {
    render(<BirthTransition manual />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText("Em bé đã chào đời?")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Ghi nhận ngày sinh khi cần"));
    expect(screen.getByLabelText("Ngày và giờ sinh")).toBeInTheDocument();
  });

  it("keeps a previously recorded birth available without a due date", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ ...emptyRecord, hasBirthRecord: true, birthOccurredAt: "2026-08-30T08:00:00Z" }));
    render(<BirthTransition />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("Thông tin lúc em bé chào đời")).toBeInTheDocument();
  });
});
