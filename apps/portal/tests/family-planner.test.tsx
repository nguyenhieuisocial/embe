import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FamilyPlanner from "../src/components/family-planner";

const task = {
  id: "12", occurrenceOn: "2026-09-03", startsOn: "2026-09-03", title: "Đặt lịch khám", note: "",
  ownerRole: "family" as const, category: "appointment" as const,
  linkTarget: "pregnancy" as const, dueTime: "09:30", repeatRule: "none" as const,
  completed: false
};

describe("one-handed family planner", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url:string)=>Response.json(url.startsWith('/api/pregnancy/care')?{snapshot:{plans:[]}}:{tasks:[task]})));
  });

  it("shows the day, progress and links each task to its related place", async () => {
    render(<FamilyPlanner selectedDate="2026-09-03" />);
    expect(await screen.findByText("Đặt lịch khám")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thứ 5, 3/9/2026" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /T5\s*03\/09/ })).toHaveAttribute("aria-current", "date");
    expect(screen.getByText("0/1 việc đã xong")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở Mẹ bầu" })).toHaveAttribute("href", "/me-bau");
    expect(screen.getByRole("link", { name: "Thêm vào Calendar" })).toHaveAttribute(
      "href", "/api/tasks/12/calendar?day=2026-09-03"
    );
    expect(screen.getByRole("button", { name: "Đánh dấu Đặt lịch khám đã xong" })).toBeInTheDocument();
  });

  it("completes optimistically and can reopen a task", async () => {
    render(<FamilyPlanner selectedDate="2026-09-03" />);
    const button = await screen.findByRole("button", { name: "Đánh dấu Đặt lịch khám đã xong" });
    fireEvent.click(button);
    expect(screen.getByText("1/1 việc đã xong")).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/tasks", expect.objectContaining({ method: "PATCH" })));
  });

  it("opens a thumb-friendly form and submits a linked repeating plan", async () => {
    render(<FamilyPlanner selectedDate="2026-09-03" />);
    await screen.findByText("Đặt lịch khám");
    fireEvent.click(screen.getByRole("button", { name: "Thêm việc mới" }));
    expect(screen.getByRole("dialog", { name: "Thêm việc" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Việc cần làm"), { target: { value: "Uống vitamin" } });
    fireEvent.change(screen.getByLabelText("Lặp lại"), { target: { value: "daily" } });
    fireEvent.change(screen.getByLabelText("Liên kết với"), { target: { value: "pregnancy" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu việc" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/tasks", expect.objectContaining({ method: "POST" })));
  });

  it("recovers an uncertain create without duplicating it, then applies an edited draft", async () => {
    const writes: { method: string; body: Record<string, unknown> }[] = [];
    let disconnected = true;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if(_url.startsWith('/api/pregnancy/care')) return Response.json({snapshot:{plans:[]}});
      if (!init?.method) return Response.json({ tasks: [] });
      writes.push({ method: init.method, body: JSON.parse(String(init.body)) });
      if (init.method === "POST" && disconnected) { disconnected = false; throw new Error("response_lost"); }
      return Response.json({ id: "99", ok: true });
    }));
    render(<FamilyPlanner selectedDate="2026-09-03" startOpen />);
    await screen.findByText("Ngày này đang thật nhẹ");
    fireEvent.change(screen.getByLabelText("Việc cần làm"), { target: { value: "Chuẩn bị giấy tờ" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu việc" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nội dung vẫn được giữ");
    fireEvent.change(screen.getByLabelText("Việc cần làm"), { target: { value: "Chuẩn bị giấy tờ và hồ sơ" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu việc" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes).toHaveLength(3);
    expect(writes[0]).toEqual(writes[1]);
    expect(writes[2]).toMatchObject({ method: "PATCH", body: { id: "99", title: "Chuẩn bị giấy tờ và hồ sơ" } });
  });

  it("locks a pending toggle and rolls it back on failure", async () => {
    let finish: (value: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => _url.startsWith('/api/pregnancy/care')?Response.json({snapshot:{plans:[]}}):init?.method
      ? new Promise<Response>(resolve => { finish = resolve; }) : Response.json({ tasks: [task] })));
    render(<FamilyPlanner selectedDate="2026-09-03" />);
    const button = await screen.findByRole("button", { name: "Đánh dấu Đặt lịch khám đã xong" });
    fireEvent.click(button); fireEvent.click(button);
    expect(button).toBeDisabled();
    finish(new Response("", { status: 503 }));
    await waitFor(() => expect(button).toBeEnabled());
    expect(button.closest('article')).not.toHaveClass('is-complete');
    expect(screen.getByText("Chưa cập nhật đủ")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
  });
});
