import Link from "next/link";

import { EmBeMark } from "./embe-icon";

type AppHeaderProps = {
  note: string;
  /** "wait" chỉ dùng khi đang chờ đồng bộ hoặc mất mạng. */
  tone?: "calm" | "wait";
};

export default function AppHeader({ note, tone = "calm" }: AppHeaderProps) {
  return (
    <header className="app-header">
      <Link className="wordmark" href="/" prefetch={false} aria-label="EmBe — về trang gia đình">
        <EmBeMark />
        EmBe
      </Link>
      <p className={tone === "wait" ? "privacy-note is-wait" : "privacy-note"}>
        <span className="dot" aria-hidden="true" />
        {note}
      </p>
    </header>
  );
}
