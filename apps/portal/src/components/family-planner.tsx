"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { Icon } from "./embe-icon";
import MedicationUseGuide from "./medication-use-guide";
import {useMedicationSchedule} from "../lib/use-medication-schedule";
import { useFamilyDataRefresh } from "../lib/use-family-data-refresh";
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
  const value = new Date(`${day}T00:00:00Z`);
  // ICU versions differ between Node and mobile browsers ("Thứ 4" vs "Th 4").
  // Keep server and first client render identical instead of hiding hydration errors.
  const weekday = value.getUTCDay() === 0 ? "Chủ nhật" : `Thứ ${value.getUTCDay() + 1}`;
  return `${weekday}, ${value.getUTCDate()}/${value.getUTCMonth() + 1}/${value.getUTCFullYear()}`;
}

function shortDate(day: string): { day: string; date: string } {
  const value = new Date(`${day}T00:00:00Z`);
  return {
    day: value.getUTCDay() === 0 ? "CN" : `T${value.getUTCDay() + 1}`,
    date: `${String(value.getUTCDate()).padStart(2, "0")}/${String(value.getUTCMonth() + 1).padStart(2, "0")}`
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

export default function FamilyPlanner({ selectedDate, startOpen = false, template }: { selectedDate: string; startOpen?: boolean; template?: Pick<Draft, "title" | "note" | "ownerRole" | "category" | "linkTarget"> }) {
  const [tasks, setTasks] = useState<FamilyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(startOpen);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => ({ ...newDraft(selectedDate), ...(startOpen ? template : {}) }));
  const createKey = useRef<string | null>(null);
  const createSnapshot = useRef<Draft | null>(null);
  const createdId = useRef<string | null>(null);
  const [pendingToggles, setPendingToggles] = useState<string[]>([]);
  const toggleLocks = useRef(new Set<string>());
  const loadSequence = useRef(0);
  const titleRef = useRef<HTMLInputElement>(null);
  const days = useMemo(() => nearbyDays(selectedDate), [selectedDate]);
  const medications = useMedicationSchedule(selectedDate);
  const completed = tasks.filter((task) => task.completed).length + medications.rows.filter(row=>row.status==='taken').length;
  const total = tasks.length + medications.rows.length;
  const ready = !loading && !error && !medications.loading && !medications.error;
  // Derived occurrences: never copy a medication into /api/tasks or match by name.
  const entries = [
    ...tasks.map(task=>({kind:'task' as const,task,time:task.dueTime??'00:00',key:`task:${task.id}:${task.occurrenceOn}`})),
    ...medications.rows.map(dose=>({kind:'dose' as const,dose,time:dose.time||'99:99',key:`dose:${dose.plan.id}:${selectedDate}:${dose.slot}`})),
  ].sort((a,b)=>a.time.localeCompare(b.time)||a.key.localeCompare(b.key));

  async function load(background = false, canApply = () => true) {
    const sequence = ++loadSequence.current;
    if (!background) { setLoading(true); setError(""); }
    try {
      const response = await fetch(`/api/tasks?from=${selectedDate}&to=${selectedDate}`, { cache: "no-store" });
      if (!response.ok) await responseError(response);
      const payload = await response.json() as { tasks?: FamilyTask[] };
      if (sequence === loadSequence.current && canApply()) setTasks(Array.isArray(payload.tasks) ? payload.tasks : []);
    } catch { if (!background && sequence === loadSequence.current) setError("Chưa mở được kế hoạch. Chạm để thử lại."); }
    finally { if (!background && sequence === loadSequence.current) setLoading(false); }
  }
  useFamilyDataRefresh(canApply => load(true, canApply), !loading && !open && !saving && !pendingToggles.length);

  useEffect(() => { void load(); return () => { loadSequence.current++; }; }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => titleRef.current?.focus());
    return () => { document.body.style.overflow = overflow; };
  }, [open]);

  function showCreate() {
    createKey.current = null;
    createSnapshot.current = null; createdId.current = null;
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
    const lock = `${task.id}:${task.occurrenceOn}`;
    if (toggleLocks.current.has(lock)) return;
    toggleLocks.current.add(lock); setPendingToggles([...toggleLocks.current]);
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
    } finally { toggleLocks.current.delete(lock); setPendingToggles([...toggleLocks.current]); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || saving) return;
    setSaving(true); setError("");
    if (!editingId) createKey.current ??= crypto.randomUUID();
    try {
      if (!editingId && !createdId.current) {
        // An uncertain create is retried with its original payload and key. If
        // the draft changed meanwhile, update that same record after recovery.
        createSnapshot.current ??= { ...draft };
        const response = await fetch("/api/tasks", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ idempotencyKey: createKey.current, ...createSnapshot.current, dueTime: createSnapshot.current.dueTime || null })
        });
        if (!response.ok) await responseError(response);
        const result = await response.json() as { id?: string };
        if (typeof result.id !== "string" || !result.id) throw new Error("missing_id");
        createdId.current = result.id;
      }
      if (editingId || JSON.stringify(createSnapshot.current) !== JSON.stringify(draft)) {
        const response = await fetch("/api/tasks", {
          method: "PATCH", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "update", id: editingId ?? createdId.current, ...draft, dueTime: draft.dueTime || null })
        });
        if (!response.ok) await responseError(response);
      }
      createKey.current = null; createSnapshot.current = null; createdId.current = null;
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
          return <Link href={`/ke-hoach?date=${day}`} aria-current={day === selectedDate ? "date" : undefined} key={day}><small>{label.day}</small><strong>{label.date}</strong></Link>;
        })}
      </nav>

      <section className="planner-panel" aria-labelledby="planner-day-title">
        <div className="planner-heading">
          <div><h2 id="planner-day-title">{dateLabel(selectedDate)}</h2></div>
          <button className="planner-add" type="button" onClick={showCreate} aria-label="Thêm việc mới"><Icon name="plus" /> Thêm</button>
        </div>
        <div className="planner-progress" aria-label={ready?`${completed} trên ${total} việc đã xong`:'Tiến độ chưa cập nhật đủ'}>
          <span><i style={{ width: ready&&total ? `${Math.round(100 * completed / total)}%` : "0%" }} /></span>
          <p>{ready?`${completed}/${total} việc đã xong`:loading||medications.loading?'Đang tải việc và thuốc…':'Chưa cập nhật đủ'}</p>
        </div>
        <div className="planner-medication-source">
          <span>{medications.mode==='preview'?'Thuốc dự kiến theo lịch đang lưu; không phải chỉ định dùng kéo dài.':medications.mode==='history'?'Thuốc chỉ hiện những lần đã ghi; không áp lịch hiện tại vào ngày cũ.':'Thuốc tự lấy từ lịch đang theo dõi.'}</span>
          <Link href="/me-bau/thuoc">Lịch thuốc <Icon name="arrow" /></Link>
        </div>

        {error ? <button className="state-note state-error planner-retry" type="button" onClick={() => void load()}>{error}</button> : null}
        {medications.error?<p className="state-note state-error" role="alert">Chưa cập nhật được thuốc. <button type="button" className="btn btn-quiet" onClick={()=>void medications.refresh()}>Tải lại thuốc</button></p>:null}
        {medications.feedback?<p className="planner-medication-feedback" role="status">{medications.feedback}</p>:null}
        {loading ? <div className="planner-loading" aria-label="Đang mở kế hoạch"><span /><span /><span /></div> : null}
        {ready && total === 0 ? (
          <div className="planner-empty"><Icon name="check" /><strong>Ngày này đang thật nhẹ</strong><p>Thêm một việc hoặc chọn gợi ý nhanh bên dưới.</p></div>
        ) : null}

        <div className="planner-thread">
          {entries.map((entry) => {
            if(entry.kind==='dose'){
              const {plan,slot,time,status}=entry.dose;
              const taken=status==='taken';
              const historical=medications.mode==='history';
              return <article className={`planner-task planner-medication${taken?' is-complete':''}`} data-state={status} key={entry.key}>
                {medications.mode==='today'&&!taken?<button className="planner-check" type="button"
                  disabled={Boolean(medications.saving)||medications.error||medications.loading}
                  aria-label={`Đánh dấu đã dùng ${plan.name} lần ${slot}`}
                  onClick={()=>void medications.markTaken(plan,slot)}><Icon name="check" /></button>
                  :<span className="planner-check" aria-label={taken?`${plan.name} lần ${slot}: đã dùng`:`${plan.name} lần ${slot}: ${historical?'đã ghi':'dự kiến'}`}><Icon name="check" /></span>}
                <div className="planner-task-body">
                  <div className="planner-task-meta"><span>{historical?'Đã ghi trong ngày':time||'Chưa đặt giờ'}</span><span>Mẹ Ngân</span><span className="planner-medication-tag">Thuốc{medications.mode==='preview'?' · dự kiến':''}</span></div>
                  <strong>{plan.name}</strong>
                  <p>{historical?`Lần ${slot}`:`${plan.dose_display || 'Chưa có liều đã ghi'} · lần ${slot}/${plan.times_per_day}`}</p>
                  <small className="planner-dose-state">{medications.saving===`${plan.id}-${slot}`?'Đang lưu…':taken?'Đã dùng':status==='skipped'?'Đã bỏ qua':status==='deferred'?'Đã hoãn':medications.mode==='preview'?'Chưa đến ngày ghi nhận':'Chưa ghi nhận dùng'}</small>
                  {historical?<Link className="planner-dose-history" href="/me-bau/thuoc">Xem lịch sử dùng thuốc</Link>
                    :<MedicationUseGuide name={plan.name} dose={plan.dose_display} instructions={plan.instructions} times={plan.reminder_times??[]} summaryLabel="Cách dùng & công dụng" />}
                </div>
              </article>;
            }
            const task=entry.task;
            const target = LINK_DETAILS[task.linkTarget];
            return (
              <article className={`planner-task${task.completed ? " is-complete" : ""}`} key={entry.key}>
                <button className="planner-check" type="button" disabled={pendingToggles.includes(`${task.id}:${task.occurrenceOn}`)} onClick={() => void toggle(task)} aria-label={task.completed ? `Mở lại ${task.title}` : `Đánh dấu ${task.title} đã xong`}><Icon name="check" /></button>
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
          <p>Gợi ý nhanh</p>
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
            {error ? <p role="alert">{error} Nội dung vẫn được giữ trong biểu mẫu.</p> : null}
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
