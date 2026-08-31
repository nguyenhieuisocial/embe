"use client";

import { usePathname } from "next/navigation";

const destinations = [
  { href: "/", icon: "home", label: "Hôm nay" },
  { href: "/ghi-lai", icon: "write", label: "Ghi lại" },
  { href: "/me-bau", icon: "care", label: "Mẹ bầu" },
  { href: "/huong-dan", icon: "family", label: "Gia đình" }
] as const;

function NavIcon({ name }: { name: (typeof destinations)[number]["icon"] }) {
  const paths = {
    home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5M9 21v-7h6v7" /></>,
    write: <><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
    care: <><path d="M12 21s-8-4.6-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.4-8 11-8 11Z" /></>,
    family: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3.5 20c.4-4 2.3-6 5.5-6s5.1 2 5.5 6M14 15.2c3.7-.8 6.1.8 6.5 4.8" /></>
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
