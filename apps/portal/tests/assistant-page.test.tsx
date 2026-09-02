import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AssistantPage from "../src/app/tro-ly/page";
import { saveDeviceRole } from "../src/lib/device-preferences";
import { readJournalQueue } from "../src/lib/journal-offline";

describe("mobile family assistant", () => {
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

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

  it("sends a direct pregnancy question as a chat conversation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", status: "pending" }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "completed", answer: "Hãy mang theo kết quả khám và các câu hỏi đã ghi." }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "accepted" }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    saveDeviceRole(localStorage, "father");
    render(<AssistantPage />);

    fireEvent.change(screen.getByRole("textbox", { name: "Câu hỏi cho EmBe" }), { target: { value: "Tôi nên chuẩn bị gì cho lần khám tới?" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));

    expect(await screen.findByText("Hãy mang theo kết quả khám và các câu hỏi đã ghi.")).toBeInTheDocument();
    expect(await screen.findByText("Đã lưu cuộc trò chuyện vào nhật ký.")).toBeInTheDocument();
    const request = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(request).toMatchObject({ topic: "hoi-dap", days: 7, question: "Tôi nên chuẩn bị gì cho lần khám tới?" });

    const journalRequest = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    expect(fetchMock.mock.calls[2][0]).toBe("/api/journal");
    expect(journalRequest).toMatchObject({ authorRole: "father" });
    expect(journalRequest.content).toContain("Ba Hiếu hỏi: Tôi nên chuẩn bị gì cho lần khám tới?");
    expect(journalRequest.content).toContain("EmBe trả lời: Hãy mang theo kết quả khám và các câu hỏi đã ghi.");
  });

  it("keeps waiting when the local AI finishes after one minute", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T07:00:00.000Z"));
    const startedAt = Date.now();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/assistant" && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", status: "pending" }), { status: 202 });
      }
      if (String(input).startsWith("/api/assistant?id=")) {
        const complete = Date.now() - startedAt >= 55_000;
        return new Response(JSON.stringify(complete
          ? { status: "completed", answer: "Câu trả lời đã hoàn tất từ máy nhà." }
          : { status: "pending" }), { status: 200 });
      }
      if (input === "/api/journal") {
        return new Response(JSON.stringify({ status: "accepted" }), { status: 202 });
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantPage />);

    fireEvent.change(screen.getByRole("textbox", { name: "Câu hỏi cho EmBe" }), { target: { value: "Tóm tắt tuần này giúp tôi" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

    expect(screen.getByText("Câu trả lời đã hoàn tất từ máy nhà.")).toBeInTheDocument();
    expect(screen.getByText("Đã lưu cuộc trò chuyện vào nhật ký.")).toBeInTheDocument();
  });

  it("queues the completed conversation when journal sync is temporarily offline", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", status: "pending" }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "completed", answer: "Mẹ Ngân đã ghi đủ nước hôm nay." }), { status: 200 }))
      .mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantPage />);

    fireEvent.change(screen.getByRole("textbox", { name: "Câu hỏi cho EmBe" }), { target: { value: "Hôm nay tôi còn thiếu gì?" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));

    expect(await screen.findByText("Mẹ Ngân đã ghi đủ nước hôm nay.")).toBeInTheDocument();
    expect(await screen.findByText("Đã giữ cuộc trò chuyện, sẽ tự lưu vào nhật ký khi có mạng.")).toBeInTheDocument();
    expect(readJournalQueue(localStorage)).toEqual([
      expect.objectContaining({
        authorRole: "mother",
        content: expect.stringContaining("Mẹ Ngân hỏi: Hôm nay tôi còn thiếu gì?")
      })
    ]);
  });
});
