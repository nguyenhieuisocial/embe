import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import JournalPage from "../src/app/ghi-lai/page";

describe("one-handed family journal", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the simple family choice and safety boundary visible", () => {
    render(<JournalPage />);

    expect(screen.getByRole("heading", { name: "Hôm nay có gì đáng nhớ?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Ba Hiếu" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Mẹ Ngân" })).toBeInTheDocument();
    expect(screen.getByLabelText("Điều đáng nhớ")).toHaveAttribute("maxLength", "1000");
    expect(screen.getByText(/Không ghi thông tin khám/i)).toBeInTheDocument();
  });

  it("submits once and clears the note after acceptance", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
    render(<JournalPage />);

    fireEvent.change(screen.getByLabelText("Điều đáng nhớ"), {
      target: { value: "Hôm nay cả nhà cùng đi dạo." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu vào nhật ký" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Đã lưu"));
    expect(screen.getByLabelText("Điều đáng nhớ")).toHaveValue("");
    expect(fetch).toHaveBeenCalledWith("/api/journal", expect.objectContaining({ method: "POST" }));
  });
});
