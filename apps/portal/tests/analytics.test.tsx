import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Be_Vietnam_Pro: () => ({ className: "font-body", style: {}, variable: "font-body" }),
  Noto_Serif: () => ({ className: "font-display", style: {}, variable: "font-display" })
}));

import RootLayout from "../src/app/layout";

describe("Google Analytics", () => {
  it("loads and configures the requested GA4 property", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <main>Portal</main>
      </RootLayout>
    );

    const document = new DOMParser().parseFromString(markup, "text/html");
    const loader = document.querySelector(
      'script[src="https://www.googletagmanager.com/gtag/js?id=G-PTX99GX5F9"]'
    );
    const initializer = document.querySelector("script#google-analytics");

    expect(loader).not.toBeNull();
    expect(loader?.hasAttribute("async")).toBe(true);
    expect(initializer?.textContent).toContain("gtag('config', 'G-PTX99GX5F9')");
  });
});
