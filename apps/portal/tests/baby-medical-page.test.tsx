import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BabyMedicalPage from "../src/app/be/ho-so/page";

describe("baby medical page", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("embe:device-role", "mother");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ records: [{
      id: "2e39dad3-c419-458d-beba-9c2063289792",
      kind: "vaccination",
      status: "planned",
      occurredAt: "2026-10-01T02:00:00.000Z",
      title: "Tiêm theo lịch",
      provider: "Cơ sở tiêm",
      clinician: "",
      notes: "",
      nextDueAt: "2026-11-01T02:00:00.000Z",
      details: { vaccine: "Vắc-xin theo phiếu hẹn", dose: "Mũi 1", reaction: null },
      documents: []
    }] })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("shows saved vaccination details and the next appointment", async () => {
    render(<BabyMedicalPage />);
    expect(await screen.findByText("Vắc-xin theo phiếu hẹn · Mũi 1")).toBeInTheDocument();
    expect(screen.getByText(/Hẹn tiếp:/)).toBeInTheDocument();
  });

  it("edits an existing record without creating a duplicate", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
      ? Response.json({ record: { id: "2e39dad3-c419-458d-beba-9c2063289792" } })
      : Response.json({ records: [{
        id: "2e39dad3-c419-458d-beba-9c2063289792", kind: "vaccination", status: "planned",
        occurredAt: "2026-10-01T02:00:00.000Z", title: "Tiêm theo lịch", provider: "Cơ sở tiêm",
        clinician: "", notes: "", nextDueAt: null, details: { vaccine: "Vắc-xin A", dose: "Mũi 1" }, documents: []
      }] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BabyMedicalPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Sửa Tiêm theo lịch" }));
    expect(screen.getByLabelText("Tiêu đề")).toHaveValue("Tiêm theo lịch");
    fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Tiêm đã cập nhật" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/baby/medical", expect.objectContaining({
      method: "POST", body: expect.stringContaining('"id":"2e39dad3-c419-458d-beba-9c2063289792"')
    })));
  });
});
