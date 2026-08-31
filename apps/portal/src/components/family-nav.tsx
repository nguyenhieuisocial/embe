"use client";

import { usePathname } from "next/navigation";

import { Icon, type IconName } from "./embe-icon";

const destinations: Array<{ href: string; icon: IconName; label: string }> = [
  { href: "/", icon: "home", label: "Hôm nay" },
  { href: "/ghi-lai", icon: "write", label: "Ghi lại" },
  { href: "/me-bau", icon: "care", label: "Mẹ bầu" },
  { href: "/lich", icon: "calendar", label: "Lịch" },
  { href: "/do-dung", icon: "supply", label: "Đồ dùng" }
];

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
          <Icon name={destination.icon} className="nav-icon" />
          {destination.label}
        </a>
      ))}
    </nav>
  );
}
