import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ViewportImage from "../src/components/viewport-image";

describe("ViewportImage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not request a private album image until it is near the iPhone viewport", () => {
    let reveal: (() => void) | undefined;
    class Observer {
      constructor(callback: IntersectionObserverCallback) {
        reveal = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", Observer);

    render(<ViewportImage alt="Kỷ niệm" height={900} src="/api/media/example" width={1200} />);
    expect(screen.getByRole("img", { name: "Kỷ niệm" })).not.toHaveAttribute("src");

    act(() => reveal?.());
    expect(screen.getByRole("img", { name: "Kỷ niệm" })).toHaveAttribute("src", "/api/media/example");
  });

  it("loads the first visible cover immediately", () => {
    vi.stubGlobal("IntersectionObserver", class { observe() {}; disconnect() {} });
    render(<ViewportImage alt="Ảnh bìa" eager height={900} src="/api/media/cover" width={1200} />);
    expect(screen.getByRole("img", { name: "Ảnh bìa" })).toHaveAttribute("src", "/api/media/cover");
  });
});
