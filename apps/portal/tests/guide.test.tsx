import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
    expect(screen.getByText(/Chưa bật sao lưu ảnh thật/)).toBeInTheDocument();
    expect(screen.queryByText(/192\.168\./)).not.toBeInTheDocument();
  });

  it("lets an iPhone user open or copy the private Immich server address", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    render(<GuidePage />);

    const address = "https://henrynguyen.tail36cb4d.ts.net/";
    expect(screen.getByRole("link", { name: "Mở Immich gia đình" })).toHaveAttribute("href", address);
    fireEvent.click(screen.getByRole("button", { name: "Sao chép địa chỉ Immich" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(address));
    expect(screen.getByRole("status")).toHaveTextContent("Đã sao chép");
  });
});
