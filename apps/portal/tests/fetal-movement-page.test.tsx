import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FetalMovementPage from "../src/app/me-bau/thai-may/page";

describe("fetal movement pattern tool", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("does not invent a universal target and shows urgent safety guidance", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ sessions: [] })));
    render(<FetalMovementPage />);
    expect(screen.getByRole("heading", { name: "Ghi nhịp thai máy" })).toBeInTheDocument();
    expect(screen.getByText(/không có một con số chuẩn/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gọi nơi khám ngay/ })).toBeInTheDocument();
    expect(screen.queryByText(/đủ 10/i)).not.toBeInTheDocument();
  });

  it("records taps optimistically after a session starts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ sessions: [] }))
      .mockResolvedValue(Response.json({ session: {
        id: "11111111-1111-4111-8111-111111111111", startedAt: new Date().toISOString(),
        endedAt: null, movementCount: 0, note: "", createdAt: new Date().toISOString()
      } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<FetalMovementPage />);
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu ghi" }));
    const movementButton = await screen.findByRole("button", { name: "Bé vừa cử động" });
    fireEvent.click(movementButton);
    await waitFor(() => expect(screen.getByText("1 lần")).toBeInTheDocument());
  });
});
