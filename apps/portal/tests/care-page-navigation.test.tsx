import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/components/app-header", () => ({ default: () => null }));
vi.mock("../src/lib/use-pregnancy-due-date", () => ({ usePregnancyDueDate: () => "" }));
vi.mock("../src/components/pregnancy-care-tracker", () => ({ default: ({ activePanel }: { activePanel: string }) => <>
  <section id="suc-khoe-iphone" hidden={activePanel !== "iphone"}>Dữ liệu iPhone</section>
  <section id="vi-chat-thuoc" hidden={activePanel !== "medication"}><input aria-label="Tên thuốc đang nhập" defaultValue="" /></section>
</> }));
import IPhoneHealthPage from "../src/app/me-bau/suc-khoe-iphone/page";

afterEach(() => window.history.replaceState(null, "", "/"));

describe("care pages are separate without losing a draft", () => {
  it("opens the correct panel from an old medication link", () => {
    window.history.replaceState(null, "", "/me-bau/suc-khoe-iphone?quick=self-purchased#vi-chat-thuoc");
    render(<IPhoneHealthPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Thuốc & vi chất");
    expect(document.getElementById("suc-khoe-iphone")).toHaveAttribute("hidden");
    expect(document.getElementById("vi-chat-thuoc")).not.toHaveAttribute("hidden");
  });
  it("switches views and returns to an unsaved draft without recreating the form", () => {
    render(<IPhoneHealthPage />);
    fireEvent.click(screen.getByRole("button", { name: "Thuốc & vi chất" }));
    const input = screen.getByLabelText("Tên thuốc đang nhập");
    fireEvent.change(input, { target: { value: "Đang ghi theo nhãn" } });
    fireEvent.click(screen.getByRole("button", { name: "Sức khỏe iPhone" }));
    expect(document.getElementById("vi-chat-thuoc")).toHaveAttribute("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Thuốc & vi chất" }));
    expect(screen.getByLabelText("Tên thuốc đang nhập")).toBe(input);
    expect(input).toHaveValue("Đang ghi theo nhãn");
    expect(window.location.hash).toBe("#vi-chat-thuoc");
  });
});
