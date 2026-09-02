"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import AppHeader from "../../components/app-header";

type Entry = { id: string; incurredOn: string; kind: "planned" | "actual"; category: string; amountVnd: number; description: string; note: string; createdAt: string; updatedAt: string };
const categoryLabel: Record<string, string> = { pregnancy_visit: "Khám thai", test: "Xét nghiệm", medicine: "Thuốc & vi chất", baby_supply: "Đồ cho Bé", birth: "Sinh nở", travel: "Đi lại", other: "Khác" };
const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };

export default function FamilyBudgetPage() {
  const [entries, setEntries] = useState<Entry[]>([]), [showForm, setShowForm] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("Đang mở sổ…"), [undo, setUndo] = useState<Entry | null>(null);
  useEffect(() => { void fetch("/api/family/budget", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); const result = await response.json() as { entries?: Entry[] }; setEntries(result.entries ?? []); setMessage(result.entries?.length ? "Đã cập nhật." : "Chưa có khoản nào."); }).catch(() => setMessage("Chưa mở được sổ. Thử lại sau nhé.")); }, []);
  const totals = useMemo(() => entries.reduce((sum, entry) => ({ ...sum, [entry.kind]: sum[entry.kind] + entry.amountVnd }), { actual: 0, planned: 0 }), [entries]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget);
    const input = { id: crypto.randomUUID(), incurredOn: String(form.get("incurredOn")), kind: String(form.get("kind")), category: String(form.get("category")), amountVnd: Number(form.get("amountVnd")), description: String(form.get("description") ?? "").trim(), note: String(form.get("note") ?? "").trim() };
    try { const response = await fetch("/api/family/budget", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }); if (!response.ok) throw new Error(); const result = await response.json() as { entry: Entry }; setEntries((current) => [result.entry, ...current]); setShowForm(false); setMessage("Đã lưu khoản mới."); event.currentTarget.reset(); } catch { setMessage("Chưa lưu được. Kiểm tra lại số tiền và đường truyền."); } finally { setBusy(false); }
  }
  async function setDeleted(entry: Entry, deleted: boolean) {
    const response = await fetch("/api/family/budget", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: entry.id, deleted }) });
    if (!response.ok) { setMessage("Chưa thay đổi được."); return; }
    if (deleted) { setEntries((current) => current.filter((item) => item.id !== entry.id)); setUndo(entry); setMessage("Đã chuyển vào phần có thể khôi phục."); }
    else { setEntries((current) => [entry, ...current]); setUndo(null); setMessage("Đã khôi phục."); }
  }
  return <main className="page budget-page"><AppHeader note="Kế hoạch riêng của gia đình" />
    <header className="page-intro compact-page-hero"><p className="panel-kicker">Khám · sinh · đồ dùng</p><h1>Ngân sách gia đình</h1><p>Ghi khoản dự kiến và khoản đã chi, không trộn với tồn kho.</p></header>
    <section className="budget-summary" aria-label="Tổng ngân sách"><article><small>Đã chi</small><strong>{money.format(totals.actual)}</strong></article><article><small>Đang dự kiến</small><strong>{money.format(totals.planned)}</strong></article></section>
    <button className="budget-add" type="button" onClick={() => setShowForm((value) => !value)}>{showForm ? "Đóng" : "Thêm khoản"}</button>
    {showForm ? <form className="budget-form" onSubmit={submit}><div><label>Loại<select name="kind" defaultValue="actual"><option value="actual">Đã chi</option><option value="planned">Dự kiến</option></select></label><label>Ngày<input name="incurredOn" type="date" defaultValue={today()} required /></label></div><div><label>Nhóm<select name="category" defaultValue="pregnancy_visit">{Object.entries(categoryLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Số tiền<input aria-label="Số tiền" name="amountVnd" type="number" inputMode="numeric" min="0" max="1000000000" step="1000" required /></label></div><label>Nội dung<input name="description" maxLength={120} placeholder="Ví dụ: Khám thai định kỳ" required /></label><label>Ghi chú<textarea name="note" rows={2} maxLength={500} /></label><button disabled={busy}>{busy ? "Đang lưu…" : "Lưu khoản này"}</button></form> : null}
    {entries.length ? <section className="budget-list" aria-label="Các khoản gần đây">{entries.map((entry) => <article key={entry.id}><div><span>{categoryLabel[entry.category] ?? "Khác"} · {entry.kind === "actual" ? "Đã chi" : "Dự kiến"}</span><strong>{entry.description}</strong><small>{new Intl.DateTimeFormat("vi-VN").format(new Date(`${entry.incurredOn}T00:00:00`))}{entry.note ? ` · ${entry.note}` : ""}</small></div><p>{money.format(entry.amountVnd)}<button type="button" onClick={() => void setDeleted(entry, true)}>Xóa</button></p></article>)}</section> : null}
    <p className="budget-message" role="status">{message}{undo ? <button type="button" onClick={() => void setDeleted(undo, false)}>Hoàn tác</button> : null}</p>
  </main>;
}
