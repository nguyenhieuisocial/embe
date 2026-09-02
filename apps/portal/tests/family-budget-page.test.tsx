import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FamilyBudgetPage from "../src/app/ngan-sach/page";

describe("family budget page", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("separates planned and actual totals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ entries: [
      { id: "1", incurredOn: "2026-09-02", kind: "actual", category: "pregnancy_visit", amountVnd: 500000, description: "Khám", note: "", createdAt: "x", updatedAt: "x" },
      { id: "2", incurredOn: "2026-09-03", kind: "planned", category: "birth", amountVnd: 20000000, description: "Dự kiến sinh", note: "", createdAt: "x", updatedAt: "x" }
    ] })));
    render(<FamilyBudgetPage />);
    await waitFor(() => expect(screen.getAllByText("500.000 ₫")).toHaveLength(2));
    expect(screen.getAllByText("20.000.000 ₫")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Thêm khoản" })).toBeInTheDocument();
  });
  it("opens a compact entry form", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ entries: [] })));
    render(<FamilyBudgetPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Thêm khoản" }));
    expect(screen.getByLabelText("Số tiền")).toHaveAttribute("inputmode", "numeric");
  });
});
