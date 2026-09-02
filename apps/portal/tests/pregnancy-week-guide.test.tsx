import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PregnancyWeekPage from "../src/app/me-bau/tuan-nay/page";

describe("pregnancy week journey", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("guides a new phone to the shared pregnancy profile", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ dueDate: null })));
    render(<PregnancyWeekPage />);
    await waitFor(() => expect(screen.getByRole("link", { name: "Cài ngày dự sinh" })).toHaveAttribute("href", "/me-bau/ho-so"));
  });

  it("shows the current week, three practical actions and the official source", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ dueDate: "2026-12-01" })));
    render(<PregnancyWeekPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: /Tuần \d+/ })).toBeInTheDocument());
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("link", { name: /NHS/ })).toHaveAttribute("href", expect.stringContaining("week-"));
    expect(screen.getByText("Không tự chẩn đoán từ nội dung theo tuần.")).toBeInTheDocument();
  });

  it("offers movement-pattern tracking only when the pregnancy reaches the relevant stage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ dueDate: "2026-12-01" })));
    render(<PregnancyWeekPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Tuần \d+/ })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Ghi nhịp thai máy/ })).toHaveAttribute("href", "/me-bau/thai-may");
  });
});
