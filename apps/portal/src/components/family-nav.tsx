"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "./embe-icon";
import { useFamilyStage } from "../lib/use-family-stage";

const pregnancyDestinations: Array<{ href: string; icon: IconName; label: string }> = [
  { href: "/", icon: "home", label: "Hôm nay" },
  { href: "/me-bau", icon: "care", label: "Mẹ bầu" },
  { href: "/ky-niem", icon: "memory", label: "Kỷ niệm" },
  { href: "/nha-minh", icon: "thread", label: "Nhà mình" }
];

const postpartumDestinations: Array<{ href: string; icon: IconName; label: string }> = [
  { href: "/", icon: "home", label: "Hôm nay" },
  { href: "/me", icon: "care", label: "Mẹ" },
  { href: "/be", icon: "milk", label: "Bé" },
  { href: "/nha-minh", icon: "thread", label: "Nhà mình" }
];

export default function FamilyNav() {
  const pathname = usePathname();
  const { postpartum } = useFamilyStage();
  const destinations = postpartum ? postpartumDestinations : pregnancyDestinations;
  return (
    <nav className="family-nav" aria-label="Điều hướng gia đình">
      {destinations.map((destination) => (
        <Link
          href={destination.href}
          key={destination.href}
          prefetch={false}
          aria-current={pathname === destination.href || destination.href !== "/" && pathname?.startsWith(`${destination.href}/`) ? "page" : undefined}
        >
          <Icon name={destination.icon} className="nav-icon" />
          {destination.label}
        </Link>
      ))}
    </nav>
  );
}
