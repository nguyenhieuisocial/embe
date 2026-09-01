import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Be_Vietnam_Pro: () => ({ className: "font-body", style: {}, variable: "font-body" }),
  Noto_Serif: () => ({ className: "font-display", style: {}, variable: "font-display" })
}));

import RootLayout from "../src/app/layout";
import LoginPage from "../src/app/login/page";

describe("Google Analytics", () => {
  it("loads the requested GA4 property only on the content-free login screen", async () => {
    const markup = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));

    const document = new DOMParser().parseFromString(markup, "text/html");
    const loader = document.querySelector(
      'script[src="https://www.googletagmanager.com/gtag/js?id=G-PTX99GX5F9"]'
    );
    const initializer = document.querySelector("script#google-analytics");

    expect(loader).not.toBeNull();
    expect(loader?.hasAttribute("async")).toBe(true);
    expect(initializer?.textContent).toContain("gtag('config', 'G-PTX99GX5F9', {");
    expect(initializer?.textContent).toContain("allow_google_signals: false");
    expect(initializer?.textContent).toContain("allow_ad_personalization_signals: false");
    expect(initializer?.textContent).toContain("anonymize_ip: true");
  });

  it("does not load third-party analytics in the private application shell", () => {
    const markup = renderToStaticMarkup(<RootLayout><main>Private family data</main></RootLayout>);
    const document = new DOMParser().parseFromString(markup, "text/html");

    expect(document.querySelector('script[src*="googletagmanager.com"]')).toBeNull();
    expect(document.querySelector("script#google-analytics")).toBeNull();
  });

  it("keeps legacy iPhone standalone mode explicit", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <main>Portal</main>
      </RootLayout>
    );

    const document = new DOMParser().parseFromString(markup, "text/html");
    expect(document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute("content")).toBe("yes");
  });
});
