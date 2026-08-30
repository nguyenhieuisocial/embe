import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import GuidePage from "../src/app/huong-dan/page";

describe("simple family guide", () => {
  it("gives non-technical family members one door and three daily steps", () => {
    render(<GuidePage />);

    expect(
      screen.getByRole("heading", { name: "Bạn không cần học các ứng dụng phía sau" })
    ).toBeInTheDocument();
    expect(screen.getByText("embe.hieu.asia")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Mở việc hôm nay/ })).toHaveAttribute(
      "href",
      "/me-bau"
    );
  });

  it("explains technical services using everyday language", () => {
    render(<GuidePage />);

    expect(screen.getByText("Chăm sóc")).toBeInTheDocument();
    expect(screen.getByText("Nhật ký")).toBeInTheDocument();
    expect(screen.getByText("Đồ dùng")).toBeInTheDocument();
    expect(screen.getByText("Trợ lý riêng")).toBeInTheDocument();
    expect(screen.getByText(/Bạn không phải tự vào máy chủ/)).toBeInTheDocument();
  });

  it("gives iPhone photo backup instructions without exposing credentials", () => {
    render(<GuidePage />);

    expect(screen.getByRole("heading", { name: "Đưa ảnh từ iPhone vào Em Bé" })).toBeInTheDocument();
    expect(screen.getByText("Cài Immich từ App Store")).toBeInTheDocument();
    expect(screen.getByText(/chỉ bật Sao lưu khi đang ở Wi-Fi nhà/)).toBeInTheDocument();
    expect(screen.queryByText(/192\.168\./)).not.toBeInTheDocument();
  });
});
