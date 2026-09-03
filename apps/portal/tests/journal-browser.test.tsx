import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import JournalBrowser from "../src/components/journal-browser";

const events = [
  { id: "1", eventAt: "2026-09-02T08:00:00+07:00", eventType: "journal" as const,
    title: "Buổi sáng của Mẹ", caption: "Hôm nay thấy nhẹ nhàng.", albumCoverUrl: null },
  { id: "2", eventAt: "2026-09-02T18:00:00+07:00", eventType: "milestone" as const,
    title: "Cột mốc nhỏ", caption: "Ba và Mẹ cùng ghi nhớ.", albumCoverUrl: null },
  { id: "3", eventAt: "2026-08-30T09:00:00+07:00", eventType: "journal" as const,
    title: "Cuối tuần", caption: "Cả nhà đi dạo ở Đế Vương.", albumCoverUrl: null }
];

describe("mobile journal browser", () => {
  afterEach(() => localStorage.clear());

  it("switches between timeline, grouped days and a lunar calendar", () => {
    render(<JournalBrowser events={events} />);

    expect(screen.getByRole("button", { name: "Dòng thời gian" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Buổi sáng của Mẹ")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Theo ngày" }));
    const day = screen.getByRole("group", { name: /2 tháng 9.*2026/i });
    expect(within(day).getByText("2 ghi chép")).toBeInTheDocument();
    expect(localStorage.getItem("embe:journal:view:v1")).toBe("days");

    fireEvent.click(screen.getByRole("button", { name: "Lịch" }));
    expect(screen.getByText("Âm lịch", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ngày 2 tháng 9 năm 2026.*2 ghi chép/i })).toBeInTheDocument();
  });

  it("shows entries for the selected calendar day without leaving the page", () => {
    render(<JournalBrowser events={events} />);
    fireEvent.click(screen.getByRole("button", { name: "Lịch" }));
    fireEvent.click(screen.getByRole("button", { name: /ngày 2 tháng 9 năm 2026.*2 ghi chép/i }));

    const selected = screen.getByRole("region", { name: /nhật ký.*2 tháng 9/i });
    expect(within(selected).getByText("Buổi sáng của Mẹ")).toBeInTheDocument();
    expect(within(selected).getByText("Cột mốc nhỏ")).toBeInTheDocument();
  });

  it("restores the last view chosen on this phone", async () => {
    localStorage.setItem("embe:journal:view:v1", "calendar");
    render(<JournalBrowser events={events} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Lịch" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("finds Vietnamese journal text and filters milestones without leaving the page", () => {
    render(<JournalBrowser events={events} />);

    expect(screen.getByText("3 mục · 2 ngày")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm trong nhật ký" }), { target: { value: "cuoi tuan" } });
    expect(screen.getByText("Cuối tuần")).toBeInTheDocument();
    expect(screen.queryByText("Buổi sáng của Mẹ")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Xóa tìm kiếm" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm trong nhật ký" }), { target: { value: "de vuong" } });
    expect(screen.getByText("Cuối tuần")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Xóa tìm kiếm" }));
    fireEvent.click(screen.getByRole("button", { name: "Cột mốc" }));
    expect(screen.getByText("Cột mốc nhỏ")).toBeInTheDocument();
    expect(screen.queryByText("Cuối tuần")).not.toBeInTheDocument();
    expect(screen.getByText("1 mục · 1 ngày")).toBeInTheDocument();
  });

  it("makes a newly accepted entry visible while background sync finishes", () => {
    render(<JournalBrowser events={[{
      ...events[0],
      id: "pending-1",
      pending: true
    }]} />);

    expect(screen.getByText("Đang đồng bộ")).toBeInTheDocument();
    expect(screen.getByText("Buổi sáng của Mẹ").closest("article")).toHaveClass("is-pending");
  });
});
