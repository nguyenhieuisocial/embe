"use client";

import { usePathname } from "next/navigation";

const destinations = [
  { href: "/", mark: "⌂", label: "Hôm nay" },
  { href: "/ghi-lai", mark: "+", label: "Ghi lại" },
  { href: "/me-bau", mark: "✓", label: "Mẹ Ngân" },
  { href: "/huong-dan", mark: "?", label: "Cách dùng" }
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
          <span aria-hidden="true">{destination.mark}</span>
          {destination.label}
        </a>
      ))}
    </nav>
  );
}
