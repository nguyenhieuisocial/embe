"use client";

import { useEffect, useState } from "react";

type TrashItem = { kind: "task" | "medical" | "meal" | "expense"; id: string; title: string; detail: string; deletedAt: string };

const kindLabel: Record<TrashItem["kind"], string> = {
  task: "Việc gia đình",
  medical: "Hồ sơ thai kỳ",
  meal: "Bữa ăn",
  expense: "Khoản chi"
};

export default function FamilyTrash() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/trash", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      const payload = await response.json() as { items?: TrashItem[] };
      if (active) setItems(Array.isArray(payload.items) ? payload.items : []);
    }).catch(() => { if (active) setMessage("Chưa mở được thùng rác."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function restore(item: TrashItem) {
    if (workingId) return;
    setWorkingId(item.id); setMessage("");
    try {
      const response = await fetch("/api/trash", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: item.kind, id: item.id })
      });
      if (!response.ok) throw new Error();
      setItems((current) => current.filter((candidate) => !(candidate.kind === item.kind && candidate.id === item.id)));
      setMessage(`Đã khôi phục “${item.title}”.`);
    } catch { setMessage("Chưa khôi phục được. Dữ liệu vẫn an toàn trong thùng rác."); }
    finally { setWorkingId(""); }
  }

  return <section className="section family-trash" aria-labelledby="family-trash-title">
    <details>
      <summary className="family-trash-summary">
        <span><small className="panel-kicker">Có thể lấy lại</small><strong id="family-trash-title">Thùng rác</strong></span>
        <span><small>{loading ? "Đang kiểm tra" : items.length ? `${items.length} mục` : "Trống"}</small><i aria-hidden="true">⌄</i></span>
      </summary>
      {loading ? <p className="state-note">Đang mở…</p> : null}
      {!loading && items.length === 0 ? <p className="family-trash-empty">Chưa có dữ liệu nào bị xóa.</p> : null}
      {items.length ? <ul className="family-trash-list">{items.map((item) => <li key={`${item.kind}-${item.id}`}>
        <span><strong>{item.title}</strong><small>{kindLabel[item.kind]} · {item.detail}</small></span>
        <button className="trash-restore" type="button" disabled={Boolean(workingId)} onClick={() => void restore(item)} aria-label={`Khôi phục ${item.title}`}>
          {workingId === item.id ? "Đang lấy…" : "Khôi phục"}
        </button>
      </li>)}</ul> : null}
      {message ? <p className="settings-saved" role="status" aria-live="polite">{message}</p> : null}
    </details>
  </section>;
}
