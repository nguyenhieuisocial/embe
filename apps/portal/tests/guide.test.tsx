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

    expect(screen.getByRole("heading", { name: "Đưa ảnh từ iPhone vào EmBe" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cài Tailscale/ })).toHaveClass("app-store-link");
    expect(screen.getByRole("link", { name: /Cài Tailscale/ })).toHaveAttribute(
      "href",
      "https://apps.apple.com/us/app/tailscale/id1470499037"
    );
    expect(screen.getByRole("link", { name: /Cài Immich/ })).toHaveAttribute(
      "href",
      "https://apps.apple.com/us/app/immich/id1613945652"
    );
    expect(screen.getByText(/Chưa tải ảnh thật lên/)).toBeInTheDocument();
    expect(screen.queryByText(/192\.168\./)).not.toBeInTheDocument();
  });
});
