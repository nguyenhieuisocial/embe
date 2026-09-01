import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PrintPhoto from "../src/components/print-photo";

describe("dedicated photo print page", () => {
  afterEach(() => vi.restoreAllMocks());

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
    expect(document.querySelector(".print-photo-main style")).toHaveTextContent("A4 landscape");
  });
});
