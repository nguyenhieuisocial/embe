import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PregnancyFolkGuidePage from "../src/app/me-bau/meo-dan-gian/page";

describe("pregnancy folk guide", () => {
  it("separates useful practices, myths, personal advice and unsafe practices", () => {
    render(<PregnancyFolkGuidePage />);
    expect(screen.getByRole("heading", { name: "Mẹo & dân gian" })).toBeInTheDocument();
    expect(screen.getByText("Gừng có thể giúp giảm nghén?")).toBeInTheDocument();
    expect(screen.getByText("Có thai phải kiêng cắt hoặc nhuộm tóc?")).toBeInTheDocument();
    expect(screen.getByText("Nước lá, rượu thuốc hoặc bài thuốc truyền miệng giúp an thai, dễ sinh?")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /WHO/ }).length).toBeGreaterThan(0);
  });

  it("finds Vietnamese text without requiring accents and filters by safety level", () => {
    render(<PregnancyFolkGuidePage />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nhuom toc" } });
    expect(screen.getByText("Có thai phải kiêng cắt hoặc nhuộm tóc?")).toBeInTheDocument();
    expect(screen.queryByText("Phải “ăn cho hai”?" )).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nên tránh" }));
    expect(screen.getByText("Chưa thấy nội dung này")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xóa tìm kiếm" }));
    expect(screen.getByText("Tinh dầu “tự nhiên” thì có thể uống, bôi hoặc xông tùy ý?")).toBeInTheDocument();
  });
});
