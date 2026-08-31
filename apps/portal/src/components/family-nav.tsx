"use client";

import { usePathname } from "next/navigation";

const destinations = [
  { href: "/", icon: "home", label: "Hôm nay" },
  { href: "/ghi-lai", icon: "write", label: "Ghi lại" },
  { href: "/me-bau", icon: "care", label: "Mẹ bầu" },
  { href: "/ky-niem", icon: "memory", label: "Kỷ niệm" },
  { href: "/do-dung", icon: "supply", label: "Đồ dùng" }
] as const;

function NavIcon({ name }: { name: (typeof destinations)[number]["icon"] }) {
  const paths = {
    home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5M9 21v-7h6v7" /></>,
    write: <><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
    care: <><path d="M12 21s-8-4.6-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.4-8 11-8 11Z" /></>,
    memory: <><rect x="3" y="5" width="18" height="15" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m4 17 4-4 3 3 3-3 6 6" /></>,
    supply: <><path d="M5 8h14l-1 13H6L5 8Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2M9 13h6" /></>
  };

  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export default function FamilyNav() {
  const pathname = usePathname();
  return (
    <nav className="family-nav" aria-label="Điều hướng gia đình">
      {destinations.map((destination) => (
        <a
          href={destination.href}
          key={destination.href}
          aria-current={pathname === destination.href ? "page" : undefined}
        >
          <NavIcon name={destination.icon} />
          {destination.label}
        </a>
      ))}
    </nav>
  );
}
