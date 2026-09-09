"use client";

import Link from "next/link";
import { useFamilyStage } from "../lib/use-family-stage";
import { Icon, type IconName } from "./embe-icon";

export default function DailyShortcuts() {
  const { postpartum } = useFamilyStage();
  const actions: Array<{ href: string; title: string; icon: IconName }> = postpartum ? [
    { href: "/be?quick=feeding", title: "Ghi cữ bú", icon: "milk" },
    { href: "/be?quick=sleep", title: "Giấc ngủ Bé", icon: "sleep" },
    { href: "/me", title: "Mẹ hồi phục", icon: "care" },
    { href: "/ghi-lai", title: "Viết nhật ký", icon: "write" }
  ] : [
    { href: "/me-bau/bua-an", title: "Ghi bữa ăn", icon: "meal" },
    { href: "/me-bau/suc-khoe", title: "Ghi sức khỏe", icon: "care" },
    { href: "/me-bau/thuoc", title: "Thuốc & vi chất", icon: "check" },
    { href: "/me-bau/ho-so#them-giay-to", title: "Thêm giấy tờ", icon: "album" }
  ];
  return <nav className="daily-shortcuts" aria-label="Lối tắt hằng ngày">
    {actions.map(action => <Link href={action.href} key={action.href} prefetch={false}><Icon name={action.icon} /><span>{action.title}</span></Link>)}
  </nav>;
}
