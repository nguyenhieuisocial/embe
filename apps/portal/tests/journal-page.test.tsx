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

  it("queues a completed note locally so a failed network request cannot erase it", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<JournalPage />);

    fireEvent.change(screen.getByLabelText("Điều đáng nhớ"), {
      target: { value: "Mạng chập chờn nhưng câu này vẫn còn." }
    });
    fireEvent.click(screen.getByRole("radio", { name: "Mẹ Ngân" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu vào nhật ký" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("sẽ tự đồng bộ"));
    expect(localStorage.getItem("embe:journal:draft:v1")).toBeNull();
    expect(localStorage.getItem("embe:journal:queue:v1")).toContain("Mạng chập chờn");
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
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("sẽ tự đồng bộ"));
    fireEvent(window, new Event("online"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Đã lưu"));

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(retryBody.idempotencyKey).toBe(firstBody.idempotencyKey);
  });

  it("never promises a sync it cannot deliver after the session expires", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    render(<JournalPage />);

    fireEvent.change(screen.getByLabelText("Điều đáng nhớ"), {
      target: { value: "Ghi chú viết sau khi phiên hết hạn." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu vào nhật ký" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cần đăng nhập lại"));
    expect(screen.getByLabelText("Điều đáng nhớ")).toHaveValue("Ghi chú viết sau khi phiên hết hạn.");
    expect(localStorage.getItem("embe:journal:queue:v1")).toBeNull();
    expect(screen.getByRole("link", { name: "đăng nhập lại" })).toHaveAttribute("href", "/login?next=/ghi-lai");
  });

  it("asks the writer to fix a note the server permanently rejects", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 400 })));
    render(<JournalPage />);

    fireEvent.change(screen.getByLabelText("Điều đáng nhớ"), {
      target: { value: "Ghi chú bị từ chối." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu vào nhật ký" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("chưa lưu được"));
    expect(localStorage.getItem("embe:journal:queue:v1")).toBeNull();
    expect(screen.getByLabelText("Điều đáng nhớ")).toHaveValue("Ghi chú bị từ chối.");
  });

  it("keeps queued notes and asks for a fresh login when replay hits an expired session", async () => {
    localStorage.setItem("embe:journal:queue:v1", JSON.stringify([{
      content: "Ghi chú đã xếp hàng từ lúc mất mạng.",
      authorRole: "mother",
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      savedAt: Date.now()
    }]));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    render(<JournalPage />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("đang chờ gửi"));
    expect(screen.getByRole("link", { name: "đăng nhập lại" })).toHaveAttribute("href", "/login?next=/ghi-lai");
    expect(localStorage.getItem("embe:journal:queue:v1")).toContain("Ghi chú đã xếp hàng");
  });

  it("tells the family when a legacy note had to be dropped from the queue", async () => {
    localStorage.setItem("embe:journal:queue:v1", JSON.stringify([{
      content: "Ghi chú cũ máy chủ không nhận.",
      authorRole: "father",
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
      savedAt: Date.now()
    }]));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 400 })));

    render(<JournalPage />);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("đã bỏ khỏi hàng chờ"));
    expect(localStorage.getItem("embe:journal:queue:v1")).toBeNull();
  });

  it("offers quick prompts without writing a fictional family memory", () => {
    render(<JournalPage />);

    fireEvent.click(screen.getByRole("button", { name: "Một cột mốc nhỏ" }));
    expect(screen.getByLabelText("Điều đáng nhớ")).toHaveValue("Một cột mốc nhỏ: ");
  });
});
