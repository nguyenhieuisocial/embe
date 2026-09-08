"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getPageContext } from "../lib/app-navigation";
import { useFamilyStage } from "../lib/use-family-stage";

import { EmBeMark, Icon } from "./embe-icon";

type AppHeaderProps = {
  note: string;
  /** "wait" chỉ dùng khi đang chờ đồng bộ hoặc mất mạng. */
  tone?: "calm" | "wait";
};

export default function AppHeader({ note, tone = "calm" }: AppHeaderProps) {
  const pathname = usePathname();
  const { postpartum } = useFamilyStage();
  const context = getPageContext(pathname ?? "/", postpartum);
  return (
    <header className="app-header">
      {context ? <Link className="context-back" href={context.parentHref} prefetch={false} aria-label={`Về ${context.parentLabel}`}>
        <Icon name="arrow" /><span>{context.parentLabel}</span>
      </Link> : <Link className="wordmark" href="/" prefetch={false} aria-label="EmBe — về trang gia đình">
        <EmBeMark />
        EmBe
      </Link>}
      <p className={tone === "wait" ? "privacy-note is-wait" : "privacy-note"}>
        <span className="dot" aria-hidden="true" />
        {note}
      </p>
    </header>
  );
}
