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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ tasks: [task] }), { status: 200 })));
  });

  it("shows the day, progress and links each task to its related place", async () => {
    render(<FamilyPlanner selectedDate="2026-09-03" />);
    expect(await screen.findByText("Đặt lịch khám")).toBeInTheDocument();
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
});
