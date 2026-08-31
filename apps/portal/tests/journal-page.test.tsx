import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import JournalPage from "../src/app/ghi-lai/page";

describe("one-handed family journal", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

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
    expect(localStorage.getItem("embe:journal:draft:v1")).toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/journal", expect.objectContaining({ method: "POST" }));
  });

  it("restores a recent local draft after Safari reloads the page", async () => {
    localStorage.setItem("embe:journal:draft:v1", JSON.stringify({
      content: "Một câu đang viết dở.",
      authorRole: "mother",
      savedAt: Date.now()
    }));

    render(<JournalPage />);

    await waitFor(() => expect(screen.getByLabelText("Điều đáng nhớ")).toHaveValue("Một câu đang viết dở."));
    expect(screen.getByRole("radio", { name: "Mẹ Ngân" })).toBeChecked();
    expect(screen.getByText("Đã khôi phục bản nháp trên thiết bị này.")).toBeInTheDocument();
  });

  it("saves typing locally so a failed network request cannot erase the draft", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<JournalPage />);

    fireEvent.change(screen.getByLabelText("Điều đáng nhớ"), {
      target: { value: "Mạng chập chờn nhưng câu này vẫn còn." }
    });
    fireEvent.click(screen.getByRole("radio", { name: "Mẹ Ngân" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu vào nhật ký" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Nội dung vẫn còn"));
    expect(JSON.parse(localStorage.getItem("embe:journal:draft:v1") ?? "{}")).toEqual(expect.objectContaining({
      content: "Mạng chập chờn nhưng câu này vẫn còn.",
      authorRole: "mother"
    }));
  });

  it("reuses the same idempotency key when a mobile network retry is needed", async () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal("crypto", { randomUUID });
    vi.stubGlobal("fetch", fetchMock);
    render(<JournalPage />);

    fireEvent.change(screen.getByLabelText("Điều đáng nhớ"), {
      target: { value: "Một sự kiện chỉ được lưu một lần." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu vào nhật ký" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Lưu vào nhật ký" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Đã lưu"));

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(retryBody.idempotencyKey).toBe(firstBody.idempotencyKey);
  });
});
