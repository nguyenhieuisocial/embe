import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PregnancyRelaxationPage from "../src/app/me-bau/thu-gian/page";

describe("pregnancy relaxation page", () => {
  it("starts a calm, non-medical breathing guide", () => {
    vi.useFakeTimers();
    render(<PregnancyRelaxationPage />);
    expect(screen.getByRole("heading", { name: "Một khoảng thở nhẹ" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu" }));
    expect(screen.getByText("Hít vào thật nhẹ")).toBeInTheDocument();
    expect(screen.getByText(/dừng lại nếu thấy chóng mặt/)).toBeInTheDocument();
    vi.useRealTimers();
  });
});
