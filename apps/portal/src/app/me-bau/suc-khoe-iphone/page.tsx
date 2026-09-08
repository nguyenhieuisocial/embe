"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AppHeader from "../../../components/app-header";
import PregnancyCareTracker from "../../../components/pregnancy-care-tracker";
import { calculatePregnancyWeek } from "../../../lib/pregnancy";
import { usePregnancyDueDate } from "../../../lib/use-pregnancy-due-date";

export default function IPhoneHealthPage() {
  const dueDate = usePregnancyDueDate();
  const week = calculatePregnancyWeek(dueDate);
  const [panel, setPanel] = useState<"iphone" | "medication">("iphone");
  useEffect(() => {
    const followLink = () => {
      const hash = window.location.hash;
      const quick = new URLSearchParams(window.location.search).get("quick");
      setPanel(hash === "#suc-khoe-iphone" ? "iphone" : hash === "#vi-chat-thuoc" || quick === "self-purchased" || quick === "prescription" ? "medication" : "iphone");
    };
    followLink();
    window.addEventListener("hashchange", followLink);
    window.addEventListener("popstate", followLink);
    return () => { window.removeEventListener("hashchange", followLink); window.removeEventListener("popstate", followLink); };
  }, []);
  function choosePanel(next: "iphone" | "medication") {
    setPanel(next);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${next === "iphone" ? "suc-khoe-iphone" : "vi-chat-thuoc"}`);
  }

  return (
    <main className="pregnancy-main pregnancy-tool-page">
      <AppHeader note="Đồng bộ riêng giữa iPhone và EmBe" />
      <header className="pregnancy-tool-intro">
        <Link href="/me-bau" prefetch={false}>← Mẹ bầu</Link>
        <h1>{panel === "medication" ? "Thuốc & vi chất" : "Sức khỏe từ iPhone"}</h1>
        <p className="intro">{panel === "medication" ? "Theo đơn, tự mua và lịch uống hằng ngày." : "Kết nối và xem lại chỉ số đã đồng bộ."}</p>
      </header>
      <nav className="care-area-nav" aria-label="Chọn sổ theo dõi">
        <button type="button" aria-pressed={panel === "medication"} aria-controls="vi-chat-thuoc" onClick={() => choosePanel("medication")}>Thuốc &amp; vi chất</button>
        <button type="button" aria-pressed={panel === "iphone"} aria-controls="suc-khoe-iphone" onClick={() => choosePanel("iphone")}>Sức khỏe iPhone</button>
      </nav>
      <PregnancyCareTracker pregnancyWeek={week} activePanel={panel} />
    </main>
  );
}
