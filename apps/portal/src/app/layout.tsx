import type { Metadata } from "next";
import { Be_Vietnam_Pro, Newsreader } from "next/font/google";

import "./globals.css";

const body = Be_Vietnam_Pro({
  subsets: ["vietnamese"],
  weight: ["400", "500", "600"],
  variable: "--font-body"
});

const display = Newsreader({
  subsets: ["vietnamese"],
  weight: ["500", "600"],
  variable: "--font-display"
});

export const metadata: Metadata = {
  title: "Em Bé — Nhật ký gia đình",
  description: "Không gian riêng để gia đình dõi theo hành trình của em bé.",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className={`${body.variable} ${display.variable}`}>
        {children}
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
gtag('config', 'G-PTX99GX5F9');`
          }}
        />
      </body>
    </html>
  );
}
