import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AssistantPage from "../src/app/tro-ly/page";

describe("mobile family assistant", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows pregnancy-first help before postnatal analysis", () => {
    render(<AssistantPage />);
    expect(screen.getByRole("heading", { name: "Mẹ Ngân cần gì lúc này?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /việc nên làm hôm nay/i })).toHaveAttribute("href", "/me-bau#viec-hom-nay");
    expect(screen.getByRole("link", { name: /ăn gì, kiêng gì/i })).toHaveAttribute("href", "/me-bau#cam-nang");
    expect(screen.getByText("Sau khi em bé chào đời")).toBeInTheDocument();
    expect(screen.getByText(/Nếu có dấu hiệu bất thường, hãy liên hệ nơi Mẹ Ngân đang khám\./)).toBeInTheDocument();
  });

  it("submits and shows the locally generated answer", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", status: "pending" }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "completed", answer: "Chưa có dữ liệu giấc ngủ trong 7 ngày qua." }), { status: 200 }))
    );
    render(<AssistantPage />);
    fireEvent.click(screen.getByRole("button", { name: /giấc ngủ của em bé/i }));
    expect(await screen.findByText("Chưa có dữ liệu giấc ngủ trong 7 ngày qua.")).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});
