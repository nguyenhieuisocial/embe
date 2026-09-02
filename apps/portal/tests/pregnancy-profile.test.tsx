import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PregnancyProfileEditor from "../src/components/pregnancy-profile-editor";

const profile = {
  dueDate: "2027-04-20", dueDateSource: "estimated_lmp", lmpDate: "2026-07-14",
  gestationType: "singleton", bloodGroup: "A", rhFactor: "positive",
  allergies: "Không có", medicalNotes: "",
  contacts: [{ id: "11111111-1111-4111-8111-111111111111", kind: "doctor", name: "Bác sĩ Lan", organization: "Phòng khám", phone: "0901234567", note: "", primary: true }]
};

describe("pregnancy profile editor", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads saved details and exposes a direct call action", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ profile })));
    render(<PregnancyProfileEditor />);
    await waitFor(() => expect(screen.getByDisplayValue("2027-04-20")).toBeInTheDocument());
    expect(screen.getByText("Bác sĩ Lan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gọi Bác sĩ Lan" })).toHaveAttribute("href", "tel:0901234567");
  });

  it("saves the profile and replaces the form status with a clear success message", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") return Response.json({ profile });
      return Response.json({ profile });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PregnancyProfileEditor />);
    await waitFor(() => expect(screen.getByDisplayValue("2027-04-20")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Lưu hồ sơ" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Đã lưu"));
    expect(fetchMock).toHaveBeenCalledWith("/api/pregnancy/profile", expect.objectContaining({ method: "PATCH" }));
  });
});
