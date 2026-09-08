"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const primary = [
  ["/studio", "Video"],
  ["/studio/ban-lam-viec", "Bản nháp"],
  ["/studio/duyet-dang", "Duyệt & đăng"]
] as const;
const sources = [
  ["/studio/kham-pha", "Khám phá chủ đề"],
  ["/studio/nghien-cuu", "Nghiên cứu"]
] as const;

export default function StudioNav() {
  const path = usePathname();
  const sourcePage = sources.some(([url]) => path === url);
  const current = path === "/studio/soan" ? "/studio/ban-lam-viec"
    : primary.some(([url]) => path === url) ? path
    : sourcePage ? null : "/studio";
  return <div className="studio-navigation">
    <nav className="studio-nav" aria-label="Điều hướng Studio">
      {primary.map(([url, label]) => <Link key={url} href={url} aria-current={current === url ? "page" : undefined}>{label}</Link>)}
    </nav>
    <details className="studio-sources-nav" key={String(sourcePage)} open={sourcePage ? true : undefined}>
      <summary>Nguồn ý tưởng <span aria-hidden="true">⌄</span></summary>
      <nav aria-label="Nguồn nội dung Studio">
        {sources.map(([url, label]) => <Link key={url} href={url} aria-current={path === url ? "page" : undefined}>{label}</Link>)}
      </nav>
    </details>
  </div>;
}
