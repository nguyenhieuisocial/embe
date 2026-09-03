"use client";

import { useEffect, useState } from "react";

import { HOSPITAL_BAG_GROUPS, HOSPITAL_BAG_IDS } from "../lib/hospital-bag";

export default function HospitalBagChecklist() {
  const [completed, setCompleted] = useState<string[]>([]);
  const [state, setState] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");

  useEffect(() => {
    let active = true;
    fetch("/api/birth-prep/bag", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return await response.json() as { completed?: string[] };
      })
      .then((payload) => { if (active && Array.isArray(payload.completed)) { setCompleted(payload.completed); setState("idle"); } })
      .catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);

  async function toggle(id: string) {
    if (state === "loading" || state === "saving") return;
    const previous = completed;
    const next = completed.includes(id) ? completed.filter((item) => item !== id) : [...completed, id];
    setCompleted(next);
    setState("saving");
    try {
      const response = await fetch("/api/birth-prep/bag", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ completed: next })
      });
      if (!response.ok) throw new Error("unavailable");
      const payload = await response.json() as { completed?: string[] };
      if (!Array.isArray(payload.completed)) throw new Error("invalid response");
      setCompleted(payload.completed);
      setState("saved");
    } catch {
      setCompleted(previous);
      setState("error");
    }
  }

  const progress = Math.round((completed.length / HOSPITAL_BAG_IDS.length) * 100);
  return <section className="section hospital-bag" id="gio-di-sinh" aria-labelledby="hospital-bag-title">
    <div className="hospital-bag-heading">
      <div><p className="panel-kicker">Tự đồng bộ giữa hai điện thoại</p><h2 id="hospital-bag-title">Giỏ đi sinh</h2></div>
      <span>{completed.length}/{HOSPITAL_BAG_IDS.length}</span>
    </div>
    <div className="care-progress" role="progressbar" aria-label="Tiến độ giỏ đi sinh" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div>
    {HOSPITAL_BAG_GROUPS.map((group, index) => <details className="hospital-bag-group" key={group.id} open={index === 0}>
      <summary><strong>{group.label}</strong><small>{group.items.filter(([id]) => completed.includes(id)).length}/{group.items.length}</small><i aria-hidden="true">⌄</i></summary>
      <div>{group.items.map(([id, label]) => <label key={id} className={completed.includes(id) ? "is-done" : ""}>
        <input type="checkbox" checked={completed.includes(id)} disabled={state === "loading" || state === "saving"} onChange={() => void toggle(id)} />
        <span aria-hidden="true">✓</span><strong>{label}</strong>
      </label>)}</div>
    </details>)}
    <p className={`hospital-bag-state is-${state}`} role="status">{state === "loading" ? "Đang mở danh sách…" : state === "saving" ? "Đang lưu…" : state === "saved" ? "Đã lưu cho cả Ngân và Hiếu." : state === "error" ? "Chưa đồng bộ được. Hãy thử lại khi mạng ổn định." : "Danh sách gợi ý; hãy theo hướng dẫn riêng của nơi sinh."}</p>
  </section>;
}
