"use client";

import { useMemo, useState } from "react";

import { pregnancyGuidance } from "../lib/pregnancy-content";

const quickTerms = ["mỹ phẩm", "retinol", "chống nắng", "hóa chất", "cà phê", "thuốc"];
const levelLabels = { do: "Nên", limit: "Hạn chế", avoid: "Tránh" } as const;

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi-VN");
}

export default function PregnancySafetySearch() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const needle = normalized(query.trim());
    if (!needle) return [];
    return pregnancyGuidance.filter((item) => normalized([
      item.category, item.title, item.detail, item.action
    ].join(" ")).includes(needle));
  }, [query]);

  return <section id="tra-cuu-an-toan" className="safety-search" aria-labelledby="safety-search-title">
    <div className="safety-search-heading">
      <div><p className="panel-kicker">Tra nhanh trước khi dùng</p><h2 id="safety-search-title">Dùng gì trong thai kỳ?</h2></div>
      <a href="#cam-nang">Xem hết</a>
    </div>
    <label className="safety-search-box">
      <span className="sr-only">Tìm món ăn, mỹ phẩm, hoạt chất hoặc hóa chất</span>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Retinol, kem dưỡng, nước lau nhà…" enterKeyHint="search" />
      {query ? <button type="button" onClick={() => setQuery("")} aria-label="Xóa nội dung tìm kiếm">×</button> : null}
    </label>
    {!query ? <div className="safety-search-chips" aria-label="Tra cứu nhanh">{quickTerms.map((term) => <button type="button" key={term} onClick={() => setQuery(term)}>{term}</button>)}</div> : null}
    {query ? <div className="safety-search-results" aria-live="polite">
      <p className="safety-search-empty">Tra theo thành phần, không chứng nhận sản phẩm. Chưa có trong danh mục không có nghĩa là an toàn. Hướng dẫn mỹ phẩm cập nhật 09/09/2026.</p>
      {results.length ? results.map((item) => <details key={item.id} className={`is-${item.level}`}>
        <summary><span><small>{levelLabels[item.level]} · {item.category}</small><strong>{item.title}</strong></span><i>⌄</i></summary>
        <div><p>{item.detail}</p><p><b>Làm ngay:</b> {item.action}</p><a href={item.sourceHref} target="_blank" rel="noreferrer">{item.sourceLabel} ↗</a></div>
      </details>) : <p className="safety-search-empty">Chưa có mục khớp. Đừng tự kết luận an toàn; hãy giữ tên hoặc ảnh nhãn để hỏi bác sĩ/dược sĩ.</p>}
    </div> : null}
  </section>;
}
