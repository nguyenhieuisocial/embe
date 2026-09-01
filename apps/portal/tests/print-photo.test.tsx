import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PrintPhoto from "../src/components/print-photo";

describe("dedicated photo print page", () => {
  afterEach(() => vi.restoreAllMocks());

  it("waits for the private image before opening AirPrint", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<PrintPhoto caption="Gia đình bên nhau" id="00000001-1111-4111-8111-111111111111" title="Kỷ niệm 1" />);

    const button = screen.getByRole("button", { name: "Mở AirPrint" });
    expect(button).toBeDisabled();

    fireEvent.load(screen.getByRole("img", { name: "Kỷ niệm 1" }));
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(print).toHaveBeenCalledOnce();
  });
});
