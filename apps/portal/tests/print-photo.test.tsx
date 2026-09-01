import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PrintPhoto from "../src/components/print-photo";

describe("dedicated photo print page", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("waits for the private image before opening AirPrint", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const { unmount } = render(<PrintPhoto caption="Gia đình bên nhau" id="00000001-1111-4111-8111-111111111111" title="Kỷ niệm 1" />);
    expect(document.body).toHaveClass("print-photo-mode");

    const button = screen.getByRole("button", { name: "Mở AirPrint" });
    expect(button).toBeDisabled();

    fireEvent.load(screen.getByRole("img", { name: "Kỷ niệm 1" }));
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(print).toHaveBeenCalledOnce();
    unmount();
    expect(document.body).not.toHaveClass("print-photo-mode");
  });

  it("enables AirPrint when the browser already cached the image", async () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(1200);
    vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(800);

    render(<PrintPhoto caption="Gia đình bên nhau" id="00000001-1111-4111-8111-111111111111" title="Kỷ niệm 1" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Mở AirPrint" })).toBeEnabled());
    expect(document.querySelector(".print-photo-main style")).toHaveTextContent("size: 297mm 210mm");
  });

  it("fits a landscape photo to the selected paper and remembers that paper", () => {
    render(<PrintPhoto caption="Gia đình bên nhau" id="00000001-1111-4111-8111-111111111111" title="Kỷ niệm 1" />);
    const image = screen.getByRole("img", { name: "Kỷ niệm 1" });
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 2160 },
      naturalHeight: { configurable: true, value: 1440 }
    });
    fireEvent.load(image);
    fireEvent.click(screen.getByRole("button", { name: "Ảnh 10 × 15 cm" }));

    expect(document.querySelector(".print-photo-main style")).toHaveTextContent("size: 150mm 100mm");
    expect(document.querySelector(".print-photo-main style")).toHaveTextContent("max-width: 150mm");
    expect(window.localStorage.getItem("embe-print-paper")).toBe("photo-10x15");
    expect(screen.getByText("Ảnh ngang · tự xoay ngang")).toBeInTheDocument();
  });

  it("keeps portrait paper orientation for a portrait photo", () => {
    render(<PrintPhoto caption="Gia đình bên nhau" id="00000001-1111-4111-8111-111111111111" title="Kỷ niệm 1" />);
    const image = screen.getByRole("img", { name: "Kỷ niệm 1" });
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1440 },
      naturalHeight: { configurable: true, value: 2160 }
    });
    fireEvent.load(image);
    fireEvent.click(screen.getByRole("button", { name: "Ảnh 13 × 18 cm" }));

    expect(document.querySelector(".print-photo-main style")).toHaveTextContent("size: 130mm 180mm");
    expect(screen.getByText("Ảnh dọc · tự xoay dọc")).toBeInTheDocument();
  });
});
