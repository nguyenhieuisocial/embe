import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AssistantPage from "../src/app/tro-ly/page";

describe("mobile family assistant", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("offers three safe one-tap questions", () => {
    render(<AssistantPage />);
    expect(screen.getByRole("button", { name: /giấc ngủ/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bú sữa/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /môi trường/i })).toBeInTheDocument();
  });

  it("submits and shows the locally generated answer", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", status: "pending" }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "completed", answer: "Chưa có dữ liệu giấc ngủ trong 7 ngày qua." }), { status: 200 }))
    );
    render(<AssistantPage />);
    fireEvent.click(screen.getByRole("button", { name: /giấc ngủ/i }));
    expect(await screen.findByText("Chưa có dữ liệu giấc ngủ trong 7 ngày qua.")).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});
