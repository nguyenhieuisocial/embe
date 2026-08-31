import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Noto_Serif } from "next/font/google";

import AppShell from "../components/app-shell";
import PwaRuntime from "../components/pwa-runtime";
import WebVitals from "../components/web-vitals";
import "./globals.css";

const body = Be_Vietnam_Pro({
  subsets: ["vietnamese"],
  weight: ["400", "500", "600"],
  variable: "--font-body"
});

const display = Noto_Serif({
  subsets: ["vietnamese"],
  weight: ["500", "600"],
  variable: "--font-display"
});

export const metadata: Metadata = {
  title: "EmBe — Sổ gia đình",
  description: "Không gian riêng để gia đình dõi theo hành trình của em bé.",
  applicationName: "EmBe",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EmBe"
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false, nocache: true }
};

export const viewport: Viewport = {
  themeColor: "#0F4A44",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${body.variable} ${display.variable}`}>
        <AppShell>{children}</AppShell>
        <PwaRuntime />
        <WebVitals />
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-PTX99GX5F9"
        />
        <script
          id="google-analytics"
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-PTX99GX5F9', {
  anonymize_ip: true,
  allow_google_signals: false,
  allow_ad_personalization_signals: false,
  cookie_flags: 'SameSite=Lax;Secure'
});`
          }}
        />
      </body>
    </html>
  );
}
