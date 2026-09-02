"use client";

import { useMemo, useState } from "react";

import { pregnancyMyths } from "../lib/pregnancy-content";

const verdicts = [
  { id: "all", label: "Tất cả" },
  { id: "keep", label: "Có thể áp dụng" },
  { id: "myth", label: "Không có cơ sở" },
  { id: "personal", label: "Cần hỏi nơi khám" },
  { id: "avoid", label: "Nên tránh" }
] as const;

const verdictLabels: Record<(typeof pregnancyMyths)[number]["verdict"], string> = {
  keep: "Có thể áp dụng",
  myth: "Không có cơ sở",
  personal: "Cần hỏi nơi khám",
  avoid: "Nên tránh"
};

function searchable(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
}

export default function FolkGuideBrowser() {
  const [query, setQuery] = useState("");
  const [verdict, setVerdict] = useState<(typeof verdicts)[number]["id"]>("all");
  const filtered = useMemo(() => {
    const needle = searchable(query.trim());
    return pregnancyMyths.filter((item) => {
      const matchesVerdict = verdict === "all" || item.verdict === verdict;
      const matchesQuery = !needle || searchable(`${item.question} ${item.answer} ${item.category}`).includes(needle);
      return matchesVerdict && matchesQuery;
    });
  }, [query, verdict]);

  return <>
    <label className="folk-search">
      <span aria-hidden="true">⌕</span>
      <input autoComplete="off" enterKeyHint="search" inputMode="search" maxLength={60} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm gừng, tóc, xông, đi xa…" type="search" value={query} />
      {query ? <button aria-label="Xóa tìm kiếm" onClick={() => setQuery("")} type="button">×</button> : null}
    </label>
    <div className="folk-filter" aria-label="Lọc theo mức độ">
      {verdicts.map((item) => <button aria-pressed={verdict === item.id} key={item.id} onClick={() => setVerdict(item.id)} type="button">{item.label}</button>)}
    </div>
    <p className="folk-result-count" role="status">{filtered.length} nội dung</p>
    <div className="folk-guide-list">
      {filtered.map((item) => <details className={`folk-guide-card is-${item.verdict}`} key={item.id}>
        <summary>
          <span><small>{item.category} · {verdictLabels[item.verdict]}</small><strong>{item.question}</strong></span>
          <i aria-hidden="true">⌄</i>
        </summary>
        <div><p>{item.answer}</p><a href={item.sourceHref} rel="noreferrer" target="_blank">{item.sourceLabel} ↗</a></div>
      </details>)}
    </div>
    {!filtered.length ? <div className="empty-state"><strong>Chưa thấy nội dung này</strong><p>Thử một từ ngắn hơn hoặc chọn “Tất cả”.</p></div> : null}
  </>;
}
