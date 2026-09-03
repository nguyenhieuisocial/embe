import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DevelopmentPage from "../src/app/be/phat-trien/page";

const lifecycle = {
  birthOccurredAt: "2026-08-01T08:00:00+07:00",
  gestationalWeeks: 40,
  babySex: "female",
  premature: false
};

function baseFetch() {
  return vi.fn()
    .mockResolvedValueOnce(Response.json({ growth: [], milestones: [] }))
    .mockResolvedValueOnce(Response.json(lifecycle));
}

describe("baby development page", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("guides the family when no growth measurement exists yet", async () => {
    vi.stubGlobal("fetch", baseFetch());
    render(<DevelopmentPage />);

    await waitFor(() => expect(screen.getByText("Chưa có lần đo nào.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Lưu lần đo" })).toBeEnabled();
  });

  it("does not send an empty growth measurement", async () => {
    const fetchMock = baseFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<DevelopmentPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Lưu lần đo" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Lưu lần đo" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Nhập ít nhất một số đo");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the entered measurement when saving fails", async () => {
    const fetchMock = baseFetch();
    fetchMock.mockResolvedValueOnce(Response.json({ error: "temporarily_unavailable" }, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DevelopmentPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Lưu lần đo" })).toBeEnabled());

    const weight = screen.getByLabelText("Cân nặng (g)");
    fireEvent.change(weight, { target: { value: "3500" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu lần đo" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Chưa lưu được"));
    expect(weight).toHaveValue(3500);
  });
});
