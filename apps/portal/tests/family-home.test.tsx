import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FamilyHomePage from "../src/app/nha-minh/page";

vi.mock("../src/components/system-status", () => ({ default: () => <section>Tình trạng EmBe</section> }));

function openGroup(title: string) {
  const summary = screen.getByText(title, { selector: ".tool-group summary strong" });
  const details = summary.closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
}

function openStatus() {
  const details = document.querySelector<HTMLDetailsElement>("#trang-thai")!;
  expect(details).not.toHaveAttribute("open");
  details.open = true;
  fireEvent(details, new Event("toggle"));
}

describe("family home hub", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.EMBE_PHOTO_SERVER_URL;
    delete process.env.EMBE_PHOTO_ACCOUNT;
  });

  it("groups the less frequent family tools away from the bottom navigation", () => {
    render(<FamilyHomePage />);

    expect(screen.getByRole("heading", { level: 1, name: "Nhà mình" })).toBeInTheDocument();
    const essentials = screen.getByRole("navigation", { name: "Việc chung thường dùng" });
    expect(within(essentials).getAllByRole("link")).toHaveLength(4);
    expect(within(essentials).getByRole("link", { name: "Lịch chung" })).toHaveAttribute("href", "/lich");
    expect(within(essentials).getByRole("link", { name: "Kế hoạch" })).toHaveAttribute("href", "/ke-hoach");
    expect(within(essentials).getByRole("link", { name: "Cài đặt" })).toHaveAttribute("href", "/cai-dat");
    expect(within(essentials).getByRole("link", { name: "Hồ sơ cả nhà" })).toHaveAttribute("href", "/nha-minh/ho-so");
    const groups = document.querySelectorAll(".tool-group");
    expect(groups).toHaveLength(7);
    for (const group of groups) expect(group).not.toHaveAttribute("open");

    openGroup("Lịch & việc chung");
    openGroup("Sức khỏe cả nhà");
    openGroup("Ảnh, nhật ký & bản in");
    openGroup("Cài đặt & kết nối");
    openGroup("Tra cứu & thư giãn");
    expect(screen.getByRole("link", { name: /^Đồ dùng/ })).toHaveAttribute("href", "/do-dung");
    expect(screen.getByRole("link", { name: /^Ngân sách & chi tiêu/ })).toHaveAttribute("href", "/ngan-sach");
    expect(screen.getByRole("link", { name: /^Trợ lý gia đình/ })).toHaveAttribute("href", "/tro-ly");
    expect(screen.getByRole("link", { name: /^Hướng dẫn sử dụng/ })).toHaveAttribute("href", "/huong-dan");
    expect(screen.getByRole("link", { name: /^Sổ Mẹ & Bé/ })).toHaveAttribute("href", "/so-me-va-be");
    expect(screen.getByRole("link", { name: /^Bệnh án & xét nghiệm/ })).toHaveAttribute("href", "/nha-minh/ho-so?tab=records");
    expect(screen.getByRole("link", { name: /^Mẹo & dân gian/ })).toHaveAttribute("href", "/me-bau/meo-dan-gian");
    openStatus();
    expect(screen.getByText("Tình trạng EmBe")).toBeInTheDocument();
  });

  it("finds tools with or without Vietnamese accents, explains no matches and clears the search", () => {
    render(<FamilyHomePage />);
    const search = screen.getByRole("searchbox", { name: "Tìm công cụ" });
    for (const query of ["thuốc", "thuoc"]) {
      fireEvent.change(search, { target: { value: query } });
      expect(screen.getByRole("link", { name: /^Thuốc & vi chất/ })).toHaveAttribute("href", "/me-bau/suc-khoe-iphone#vi-chat-thuoc");
      expect(screen.getByRole("status")).toHaveTextContent("công cụ phù hợp");
      for (const group of document.querySelectorAll(".tool-group")) expect(group).toHaveAttribute("open");
    }
    fireEvent.change(search, { target: { value: "zzzz-khong-co-cong-cu" } });
    expect(document.querySelectorAll(".tool-group")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("Chưa tìm thấy");
    fireEvent.click(screen.getByRole("button", { name: "Xóa tìm kiếm công cụ" }));
    expect(search).toHaveValue("");
    expect(document.querySelectorAll(".tool-group")).toHaveLength(7);
    for (const group of document.querySelectorAll(".tool-group")) expect(group).not.toHaveAttribute("open");
  });

  it("never renders an unavailable photo endpoint as a broken link", () => {
    render(<FamilyHomePage />);

    openStatus();
    expect(screen.getByText("Thư viện ảnh riêng")).toBeInTheDocument();
    expect(screen.getByText("Địa chỉ Immich hiện khi máy nhà sẵn sàng.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kết nối iPhone" })).toHaveAttribute("href", "/huong-dan#iphone-title");
  });

  it("reloads EmBe from inside the app instead of requiring it to be closed", () => {
    const reload = vi.spyOn(window.history, "go").mockImplementation(() => undefined);
    render(<FamilyHomePage />);

    openStatus();
    fireEvent.click(screen.getByRole("button", { name: "Tải lại EmBe" }));

    expect(reload).toHaveBeenCalledWith(0);
  });
});
