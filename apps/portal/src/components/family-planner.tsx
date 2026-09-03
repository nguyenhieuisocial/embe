"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { Icon } from "./embe-icon";
import {
  dateInVietnam, LINK_DETAILS, type FamilyTask, type LinkTarget,
  type OwnerRole, type RepeatRule, type TaskCategory
} from "../lib/family-task-contract";

const ownerLabels: Record<OwnerRole, string> = { mother: "Mẹ Ngân", father: "Ba Hiếu", family: "Cả nhà" };
const repeatLabels: Record<RepeatRule, string> = { none: "Không lặp", daily: "Mỗi ngày", weekly: "Mỗi tuần" };
const categoryLabels: Record<TaskCategory, string> = {
  general: "Việc chung", pregnancy: "Thai kỳ", meal: "Ăn uống", health: "Sức khỏe",
  inventory: "Đồ dùng", journal: "Nhật ký", memory: "Kỷ niệm", appointment: "Lịch hẹn"
};

type Draft = {
  title: string; note: string; ownerRole: OwnerRole; category: TaskCategory;
  linkTarget: LinkTarget; dueOn: string; dueTime: string; repeatRule: RepeatRule;
};

function newDraft(day: string): Draft {
  return { title: "", note: "", ownerRole: "family", category: "general", linkTarget: "none", dueOn: day, dueTime: "", repeatRule: "none" };
}

function dateLabel(day: string): string {
  return new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${day}T00:00:00Z`));
}

function shortDate(day: string): { day: string; date: string } {
  const value = new Date(`${day}T00:00:00Z`);
  return {
    day: new Intl.DateTimeFormat("vi-VN", { weekday: "short", timeZone: "UTC" }).format(value),
    date: new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(value)
  };
}

function nearbyDays(selectedDate: string): string[] {
  const middle = new Date(`${selectedDate}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(middle);
    value.setUTCDate(value.getUTCDate() + index - 3);
    return value.toISOString().slice(0, 10);
  });
}

async function responseError(response: Response): Promise<never> {
  if (response.status === 401) window.location.assign("/login");
  throw new Error("request_failed");
}

export default function FamilyPlanner({ selectedDate, startOpen = false }: { selectedDate: string; startOpen?: boolean }) {
  const [tasks, setTasks] = useState<FamilyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(startOpen);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => newDraft(selectedDate));
  const titleRef = useRef<HTMLInputElement>(null);
  const days = useMemo(() => nearbyDays(selectedDate), [selectedDate]);
  const completed = tasks.filter((task) => task.completed).length;

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/tasks?from=${selectedDate}&to=${selectedDate}`, { cache: "no-store" });
      if (!response.ok) await responseError(response);
      const payload = await response.json() as { tasks?: FamilyTask[] };
      setTasks(Array.isArray(payload.tasks) ? payload.tasks : []);
    } catch { setError("Chưa mở được kế hoạch. Chạm để thử lại."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => titleRef.current?.focus());
    return () => { document.body.style.overflow = overflow; };
  }, [open]);

  function showCreate() {
    setDraft(newDraft(selectedDate)); setEditingId(null); setDeleteArmed(false); setOpen(true);
  }

  function showEdit(task: FamilyTask) {
    setDraft({
      title: task.title, note: task.note, ownerRole: task.ownerRole, category: task.category,
      linkTarget: task.linkTarget, dueOn: task.startsOn, dueTime: task.dueTime ?? "", repeatRule: task.repeatRule
    });
    setEditingId(task.id); setDeleteArmed(false); setOpen(true);
  }

  async function toggle(task: FamilyTask) {
    const next = !task.completed;
    setTasks((current) => current.map((item) => item.id === task.id && item.occurrenceOn === task.occurrenceOn ? { ...item, completed: next } : item));
    setError("");
    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "complete", id: task.id, occurrenceOn: task.occurrenceOn, completed: next, completedBy: "family" })
      });
      if (!response.ok) await responseError(response);
    } catch {
      setTasks((current) => current.map((item) => item.id === task.id && item.occurrenceOn === task.occurrenceOn ? { ...item, completed: !next } : item));
      setError("Chưa lưu được. EmBe đã trả việc về trạng thái trước.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/tasks", {
        method: editingId ? "PATCH" : "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? { action: "update", id: editingId } : { idempotencyKey: crypto.randomUUID() }),
          ...draft, dueTime: draft.dueTime || null
        })
      });
      if (!response.ok) await responseError(response);
      setOpen(false); await load();
    } catch { setError("Chưa lưu được việc này. Vui lòng thử lại."); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!editingId || saving) return;
    if (!deleteArmed) { setDeleteArmed(true); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/tasks", {
        method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: editingId })
      });
      if (!response.ok) await responseError(response);
      setOpen(false); await load();
    } catch { setError("Chưa xóa được. Việc vẫn được giữ nguyên."); }
    finally { setSaving(false); }
  }

  return (
    <>
      <nav className="planner-days" aria-label="Chọn ngày trong kế hoạch">
        {days.map((day) => {
          const label = shortDate(day);
          return <a href={`/ke-hoach?date=${day}`} aria-current={day === selectedDate ? "date" : undefined} key={day}><small>{label.day}</small><strong>{label.date}</strong></a>;
        })}
      </nav>

      <section className="planner-panel" aria-labelledby="planner-day-title">
        <div className="planner-heading">
          <div><p className="panel-kicker">Kế hoạch của cả nhà</p><h2 id="planner-day-title">{dateLabel(selectedDate)}</h2></div>
          <button className="planner-add" type="button" onClick={showCreate} aria-label="Thêm việc mới"><Icon name="plus" /> Thêm</button>
        </div>
        <div className="planner-progress" aria-label={`${completed} trên ${tasks.length} việc đã xong`}>
          <span><i style={{ width: tasks.length ? `${Math.round(100 * completed / tasks.length)}%` : "0%" }} /></span>
          <p>{completed}/{tasks.length} việc đã xong</p>
        </div>

        {error ? <button className="state-note state-error planner-retry" type="button" onClick={() => void load()}>{error}</button> : null}
        {loading ? <div className="planner-loading" aria-label="Đang mở kế hoạch"><span /><span /><span /></div> : null}
        {!loading && tasks.length === 0 ? (
          <div className="planner-empty"><Icon name="check" /><strong>Ngày này đang thật nhẹ</strong><p>Thêm một việc hoặc chọn gợi ý nhanh bên dưới.</p></div>
        ) : null}

        <div className="planner-thread">
          {tasks.map((task) => {
            const target = LINK_DETAILS[task.linkTarget];
            return (
              <article className={`planner-task${task.completed ? " is-complete" : ""}`} key={`${task.id}-${task.occurrenceOn}`}>
                <button className="planner-check" type="button" onClick={() => void toggle(task)} aria-label={task.completed ? `Mở lại ${task.title}` : `Đánh dấu ${task.title} đã xong`}><Icon name="check" /></button>
                <div className="planner-task-body">
                  <div className="planner-task-meta"><span>{task.dueTime ?? "Cả ngày"}</span><span>{ownerLabels[task.ownerRole]}</span>{task.repeatRule !== "none" ? <span>{repeatLabels[task.repeatRule]}</span> : null}</div>
                  <strong>{task.title}</strong>
                  {task.note ? <p>{task.note}</p> : null}
                  <div className="planner-task-links">
                    {target.href ? <a href={target.href}>Mở {target.label}<Icon name="arrow" /></a> : <span>{categoryLabels[task.category]}</span>}
                    {task.category === "appointment" ? <a href={`/api/tasks/${task.id}/calendar?day=${task.occurrenceOn}`} download>Thêm vào Calendar</a> : null}
                    <button type="button" onClick={() => showEdit(task)}>Sửa</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="planner-suggestions" aria-label="Gợi ý việc nhanh">
          <p>GỢI Ý NHANH</p>
          <a href={`/ke-hoach?date=${selectedDate}&them=1#them-viec`}>Ghi câu hỏi cho lần khám</a>
          <Link href="/do-dung">Xem đồ sắp hết</Link>
          <Link href="/ghi-lai#viet-nhat-ky">Ghi lại một điều hôm nay</Link>
        </div>
      </section>

      {open ? <>
        <button className="sheet-backdrop" type="button" aria-label="Đóng biểu mẫu" onClick={() => setOpen(false)} />
        <section className="sheet planner-sheet" id="them-viec" role="dialog" aria-modal="true" aria-labelledby="planner-form-title">
          <span className="sheet-grip" aria-hidden="true" />
          <header className="sheet-head"><div><p className="panel-kicker">Một việc rõ ràng</p><h2 id="planner-form-title">{editingId ? "Sửa việc" : "Thêm việc"}</h2></div><button className="sheet-close" type="button" aria-label="Đóng" onClick={() => setOpen(false)}><Icon name="close" /></button></header>
          <form className="planner-form sheet-body" onSubmit={submit}>
            <label>Việc cần làm<input ref={titleRef} required maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <div className="planner-form-row"><label>Ngày<input type="date" required value={draft.dueOn} onChange={(event) => setDraft({ ...draft, dueOn: event.target.value })} /></label><label>Giờ (nếu có)<input type="time" value={draft.dueTime} onChange={(event) => setDraft({ ...draft, dueTime: event.target.value })} /></label></div>
            <div className="planner-form-row"><label>Người làm<select value={draft.ownerRole} onChange={(event) => setDraft({ ...draft, ownerRole: event.target.value as OwnerRole })}><option value="family">Cả nhà</option><option value="mother">Mẹ Ngân</option><option value="father">Ba Hiếu</option></select></label><label>Lặp lại<select value={draft.repeatRule} onChange={(event) => setDraft({ ...draft, repeatRule: event.target.value as RepeatRule })}><option value="none">Không lặp</option><option value="daily">Mỗi ngày</option><option value="weekly">Mỗi tuần</option></select></label></div>
            <label>Nhóm việc<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as TaskCategory })}>{Object.entries(categoryLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Liên kết với<select value={draft.linkTarget} onChange={(event) => setDraft({ ...draft, linkTarget: event.target.value as LinkTarget })}><option value="none">Không liên kết</option><option value="pregnancy">Mẹ bầu</option><option value="meal">Bữa ăn</option><option value="health">Sức khỏe</option><option value="inventory">Đồ dùng</option><option value="journal">Nhật ký</option><option value="memory">Kỷ niệm</option><option value="calendar">Lịch</option><option value="assistant">Trợ lý</option></select></label>
            <label>Ghi chú<textarea maxLength={500} rows={3} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
            <button className="btn btn-primary btn-block" type="submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu việc"}</button>
            {editingId ? <button className={`planner-delete${deleteArmed ? " is-armed" : ""}`} type="button" disabled={saving} onClick={() => void remove()}>{deleteArmed ? "Chạm lần nữa để xóa" : "Xóa việc này"}</button> : null}
          </form>
        </section>
      </> : null}
    </>
  );
}
