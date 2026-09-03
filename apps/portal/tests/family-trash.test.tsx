import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FamilyTrash from "../src/components/family-trash";

describe("family trash", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps deleted items compact and restores one item without leaving settings", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [
        { kind: "medical", id: "11111111-1111-4111-8111-111111111111", title: "Khám thai", detail: "Bệnh viện", deletedAt: "2026-09-02T09:00:00Z" },
        { kind: "meal", id: "22222222-2222-4222-8222-222222222222", title: "Bữa trưa", detail: "Cơm và cá", deletedAt: "2026-09-02T08:00:00Z" },
        { kind: "expense", id: "33333333-3333-4333-8333-333333333333", title: "Vitamin", detail: "Thuốc · 320.000 ₫", deletedAt: "2026-09-02T07:00:00Z" }
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<FamilyTrash />);
    await screen.findByText("Khám thai");
    expect(screen.getByText("Hồ sơ thai kỳ · Bệnh viện")).toBeInTheDocument();
    expect(screen.getByText("Bữa ăn · Cơm và cá")).toBeInTheDocument();
    expect(screen.getByText("Khoản chi · Thuốc · 320.000 ₫")).toBeInTheDocument();
    const restore = screen.getByRole("button", { name: "Khôi phục Khám thai" });
    expect(restore).toHaveClass("trash-restore");
    fireEvent.click(restore);

    await waitFor(() => expect(screen.queryByText("Khám thai")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Đã khôi phục");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/trash", expect.objectContaining({ method: "POST" }));
  });
});
