import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BirthTransition from "../src/components/birth-transition";

const emptyRecord = {
  birthOccurredAt: null, birthMethod: null, gestationalWeeks: null, gestationalDays: null,
  birthWeightG: null, birthLengthCm: null, birthHeadCm: null, birthFacility: null,
  birthClinician: null, premature: false, lowBirthWeight: false, specialMonitoring: false,
  specialMonitoringNotes: null, dischargedAt: null, dischargeNotes: null, hasBirthRecord: false
};

describe("birth transition", () => {
  beforeEach(() => {
    localStorage.clear();
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
    render(<BirthTransition />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByText("Em bé đã chào đời?"));
    fireEvent.change(screen.getByLabelText("Ngày và giờ sinh"), { target: { value: "2026-08-30T15:15" } });
    fireEvent.change(screen.getByLabelText("Hình thức sinh"), { target: { value: "vaginal" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin sinh" }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(fetch).toHaveBeenLastCalledWith("/api/family/lifecycle", expect.objectContaining({ method: "PATCH" }));
    expect(screen.getByRole("status")).toHaveTextContent("chuyển sang chế độ sau sinh");
    expect(localStorage.getItem("embe:family:birth-occurred-at")).toContain("2026-08-30");
  });
});
