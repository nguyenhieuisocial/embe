"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { dateKey } from "../lib/calendar";
import { useFamilyDataRefresh } from "../lib/use-family-data-refresh";
import { ClinicalRecordDetails, ClinicalRecordFields } from './family-clinical-record';
import FamilyRecordDocuments from './family-record-documents';
import { MEMBER_ROLES, PROFILE_GROUPS, PROFILE_HISTORY_FIELDS, FAMILY_METRICS, RECORD_KINDS, MEASUREMENT_CONTEXTS, memberAge, validFamilyMember,
  validMemberRecord, type FamilyMember, type MemberRecord, type RecordKind } from "../lib/family-members";

async function request<T>(url: string, value?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: value === undefined ? "GET" : "POST", cache: "no-store", signal,
    ...(value === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(value) }) });
  if (!response.ok) throw new Error(response.status === 409 ? "Hồ sơ đã thay đổi trên điện thoại khác. Nội dung đang nhập vẫn được giữ. Chọn Hủy thay đổi để lấy bản mới trước khi sửa tiếp."
    : response.status === 400 ? "Kiểm tra ngày sinh, thời điểm ghi và đơn vị số đo; bản ghi không được trước ngày sinh."
    : response.status === 401 ? "Phiên đăng nhập đã hết. Đăng nhập lại để lưu."
    : "Chưa thể kết nối. Thông tin đang nhập vẫn được giữ; hãy thử lại.");
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Cần đăng nhập lại để mở hồ sơ.");
  return response.json() as Promise<T>;
}
const displayTime = (value: string) => new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" });
const localTime = (value: string) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};

export default function FamilyMembers({ initialRole, initialTab = "profile" }: { initialRole?: string; initialTab?: "profile" | "records" }) {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [drafts, setDrafts] = useState<Record<string, FamilyMember>>({});
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [recordEditing, setRecordEditing] = useState(false);
  const [archived, setArchived] = useState(false);
  const [tab, setTab] = useState<"profile" | "records">(initialTab);
  const controller = useRef<AbortController | null>(null);
  const member = drafts[selected] ?? members.find(m => m.id === selected);
  const allMembers = [...members.filter(m => !drafts[m.id]), ...Object.values(drafts)];

  async function load(background = false, canApply = () => true) {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    if (!background) { setLoading(true); setError(""); }
    try {
      const result = await request<{ members: FamilyMember[] }>("/api/family/members", undefined, abort.signal);
      if (!Array.isArray(result.members) || !result.members.every(validFamilyMember)) throw new Error("Chưa thể đọc hồ sơ. Hãy thử lại.");
      if (abort.signal.aborted || !canApply()) return;
      setMembers(result.members); setSelected(id => id || result.members.find(m => !m.archived && m.role === initialRole)?.id || result.members.find(m => !m.archived)?.id || "");
    } catch (err) { if (!background && !abort.signal.aborted) setError((err as Error).message); }
    finally { if (!background && !abort.signal.aborted) setLoading(false); }
  }
  useFamilyDataRefresh(canApply => load(true, canApply), !loading && !saving && !recordEditing && !Object.keys(drafts).length);
  useEffect(() => { void load(); return () => controller.current?.abort(); }, []);

  function edit(patch: Partial<FamilyMember>) {
    if (!member) return;
    setDrafts(old => ({ ...old, [member.id]: { ...member, ...patch } })); setMessage("");
  }
  function addChild() {
    const next: FamilyMember = { id: crypto.randomUUID(), role: "child", fullName: "", preferredName: "",
      birthDate: null, sexAtBirth: "unknown", details: {}, revision: 0, archived: false };
    setDrafts(old => ({ ...old, [next.id]: next })); setSelected(next.id); setTab("profile"); setMessage(""); setArchived(false);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member || saving) return;
    if (!validFamilyMember(member)) { setError("Kiểm tra tên, ngày sinh và các mục đã nhập. Không cần điền tất cả các mục."); return; }
    const id = member.id; setSaving(true); setError(""); setMessage("");
    try {
      const result = await request<{ member: FamilyMember }>("/api/family/members", member);
      if (!validFamilyMember(result.member)) throw new Error("Chưa xác nhận được bản lưu. Hãy thử lại.");
      setMembers(old => [...old.filter(m => m.id !== id), result.member]);
      setDrafts(old => { const next = { ...old }; delete next[id]; return next; });
      setMessage("Đã lưu hồ sơ."); setArchived(result.member.archived);
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }
  function discard() {
    if (!member) return;
    const id = member.id;
    setDrafts(old => { const next = { ...old }; delete next[id]; return next; });
    if (member.revision === 0) setSelected(members[0]?.id ?? "");
    setError(""); setMessage("");
    void load();
  }

  return <div className="member-workspace">
    <p className="state-note">Hồ sơ dùng chung trong tài khoản gia đình của Hiếu và Ngân. Chỉ nhập điều cần lưu.</p>
    <div className="member-actions">
      <button className="btn btn-primary" onClick={addChild} disabled={loading || saving || recordEditing}>Thêm con / người thân</button>
      <button className="btn btn-quiet" onClick={() => { setArchived(v => !v); setSelected(allMembers.find(m => m.archived !== archived)?.id ?? ""); }} disabled={recordEditing || saving}>{archived ? "Đang dùng" : "Đã lưu trữ"}</button>
    </div>
    {loading ? <p role="status">Đang tải hồ sơ…</p> : null}
    {error ? <p className="state-note is-wait" role="alert">{error} <button type="button" className="btn btn-quiet" disabled={saving} onClick={() => void load()}>Tải lại danh sách</button></p> : null}
    {message ? <p role="status" className="state-note">{message}</p> : null}
    <nav className="member-people" aria-label="Chọn hồ sơ thành viên">
      {allMembers.filter(m => m.archived === archived).map(m => <button key={m.id} type="button" aria-pressed={selected === m.id}
        disabled={saving || recordEditing} onClick={() => { setSelected(m.id); setMessage(""); setError(""); }}>
        <strong>{m.preferredName || m.fullName || "Hồ sơ mới"}</strong><small>{MEMBER_ROLES[m.role]} · {memberAge(m)}{drafts[m.id] ? " · Chưa lưu" : ""}</small>
      </button>)}
    </nav>
    {recordEditing ? <p className="state-note">Lưu hoặc hủy bản ghi đang nhập để chuyển người.</p> : null}
    {member ? <>
      <div className="member-tabs" role="group" aria-label="Nội dung hồ sơ">
        <button aria-pressed={tab === "profile"} onClick={() => setTab("profile")} disabled={recordEditing}>Thông tin</button>
        <button aria-pressed={tab === "records"} onClick={() => setTab("records")} disabled={!member.revision}>Sức khỏe & bệnh án</button>
      </div>
      <div hidden={tab !== "profile"}>
        <form className="member-form" onSubmit={save}>
          <fieldset disabled={saving}>
            <legend>{member.preferredName || member.fullName || "Thêm thành viên"}</legend>
            <label>Họ và tên<input required maxLength={160} autoComplete="off" value={member.fullName} onChange={e => edit({ fullName: e.target.value })} /></label>
            <label>Tên gọi trong nhà<input maxLength={80} autoComplete="off" value={member.preferredName} onChange={e => edit({ preferredName: e.target.value })} /></label>
            <div className="member-fields">
              <label>Vai trò<select value={member.role} disabled={member.revision > 0} onChange={e => edit({ role: e.target.value as FamilyMember["role"] })}>
                {Object.entries(MEMBER_ROLES).filter(([role]) => member.revision > 0 || ["child","relative"].includes(role)).map(([key,label]) => <option value={key} key={key}>{label}</option>)}
              </select></label>
              <label>Ngày sinh<input type="date" min={["mother","father"].includes(member.role) ? "1940-01-01" : "1800-01-01"} max={dateKey(new Date())}
                value={member.birthDate ?? ""} onChange={e => edit({ birthDate: e.target.value || null })} /></label>
            </div>
        <p className="state-note">{memberAge(member)}. Chưa sinh hoặc chưa rõ ngày sinh: để trống.</p>
            <label>Giới tính khi sinh (nếu cần cho hồ sơ sức khỏe)<select value={member.sexAtBirth} onChange={e => edit({ sexAtBirth: e.target.value as FamilyMember["sexAtBirth"] })}>
              <option value="unknown">Chưa ghi / không muốn ghi</option><option value="female">Nữ</option><option value="male">Nam</option>
            </select></label>
            {member.role === "mother" ? <p className="state-note">Để trống khi chưa rõ; nhập 0 nếu xác nhận chưa từng có. Các mục này dùng chung cho hai điện thoại. Kết quả khám, số đo, thuốc và xét nghiệm lưu theo từng lần trong Sức khỏe & bệnh án.</p> : null}
            {PROFILE_GROUPS.filter(group => !group.role || group.role === member.role).map(group => <details className="member-group" key={group.title}>
              <summary>{group.title}<small>{group.fields.filter(f => member.details[f.key]).length}/{group.fields.length} mục</small></summary>
              {group.fields.map(field => <label key={field.key}>{field.label}
                {field.options ? <select value={member.details[field.key] ?? ""} onChange={e => edit({ details: { ...member.details, [field.key]: e.target.value } })}>
                  <option value="">Chưa ghi</option>{field.options.map(option => <option key={option}>{option}</option>)}
                </select> : field.type ? <input type={field.type} min={field.type === "number" ? (field.min ?? .1) : undefined} max={field.max} step={field.integer ? 1 : "any"} maxLength={1000}
                  value={member.details[field.key] ?? ""} onChange={e => edit({ details: { ...member.details, [field.key]: e.target.value } })} />
                  : <textarea rows={2} maxLength={1000} value={member.details[field.key] ?? ""} onChange={e => edit({ details: { ...member.details, [field.key]: e.target.value } })} />}
              </label>)}
            </details>)}
            {member.revision > 0 && !["mother","father"].includes(member.role) ? <label className="member-checkbox"><input type="checkbox" checked={member.archived} onChange={e => edit({ archived: e.target.checked })} />Lưu trữ hồ sơ (giữ lại dữ liệu)</label> : null}
          </fieldset>
          <div className="member-actions"><button type="submit" className="btn btn-primary" disabled={saving || loading}>{saving ? "Đang lưu…" : "Lưu hồ sơ"}</button>
            {drafts[selected] ? <button type="button" className="btn btn-quiet" disabled={saving} onClick={discard}>Hủy thay đổi</button> : null}
          </div>
        </form>
        {member.role === "mother" ? <Link className="btn btn-quiet btn-block" href="/me-bau/suc-khoe">Hồ sơ thai kỳ & sức khỏe đã có của Mẹ</Link> : null}
        {member.revision > 0 ? <MemberRevisions key={`${member.id}-${member.revision}`} id={member.id} /> : null}
      </div>
      {member.revision > 0 ? <div hidden={tab !== "records"}><MemberRecords key={member.id} member={member} onEditing={setRecordEditing} /></div> : null}
    </> : !loading && !error ? <p>Thêm thành viên để bắt đầu lưu hồ sơ.</p> : null}
  </div>;
}

function MemberRecords({ member, onEditing }: { member: FamilyMember; onEditing: (editing: boolean) => void }) {
  const [records, setRecords] = useState<MemberRecord[]>([]);
  const [latest, setLatest] = useState<MemberRecord[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<MemberRecord | null>(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentPanels, setDocumentPanels] = useState<string[]>([]);
  const [savedRecord, setSavedRecord] = useState('');
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const sequence = useRef(0);
  const editor = useRef<HTMLFormElement>(null);
  async function load(offset = 0) {
    const seq = ++sequence.current; setLoading(true); setError("");
    try {
      const result = await request<{ records: MemberRecord[]; latest: MemberRecord[]; nextOffset: number | null }>(`/api/family/members/${member.id}/records?offset=${offset}&deleted=${deleted}&kind=${encodeURIComponent(filter)}&q=${encodeURIComponent(query)}`);
      if (sequence.current !== seq) return;
      setRecords(old => offset ? [...old, ...result.records.filter(r => !old.some(o => o.id === r.id))] : result.records); setNextOffset(result.nextOffset);
      setLatest(result.latest);
    } catch (err) { if (sequence.current === seq) setError((err as Error).message); }
    finally { if (sequence.current === seq) setLoading(false); }
  }
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [member.id, deleted, filter, query]);
  useFamilyDataRefresh(async canApply => {
    const seq = ++sequence.current;
    const refreshed: MemberRecord[] = [];
    let offset: number | null = 0;
    let last: { records: MemberRecord[]; latest: MemberRecord[]; nextOffset: number | null } | undefined;
    // Re-fetch only pages already visible; never collapse an expanded history.
    const pages = Math.max(1, Math.ceil(records.length / 40));
    for (let page = 0; page < pages && offset !== null; page++) {
      last = await request(`/api/family/members/${member.id}/records?offset=${offset}&deleted=${deleted}&kind=${encodeURIComponent(filter)}&q=${encodeURIComponent(query)}`);
      if (!canApply() || seq !== sequence.current || !last) return;
      refreshed.push(...last.records); offset = last.nextOffset;
    }
    if (last && canApply() && seq === sequence.current) {
      setRecords([...new Map(refreshed.map(record => [record.id, record])).values()]);
      setLatest(last.latest); setNextOffset(offset);
    }
  }, !loading && !saving && !draft && !documentBusy && !documentPanels.length);
  function begin(record?: MemberRecord, clinical = false) {
    setDraft(record ?? { id: crypto.randomUUID(), memberId: member.id, kind: "measurement", title: "Cân nặng", occurredAt: new Date().toISOString(),
      notes: "", source: "Nhập tay", nextDueDate: null, metric: "weight", value: null, secondaryValue: null, unit: "kg", revision: 0, deleted: false });
    if (!record && clinical) setDraft({ id: crypto.randomUUID(), memberId: member.id, kind: 'visit', title: '', occurredAt: new Date().toISOString(),
      notes: '', source: '', nextDueDate: null, metric: null, value: null, secondaryValue: null, unit: null, revision: 0, deleted: false });
    onEditing(true); setMessage("");
  }
  function change(patch: Partial<MemberRecord>) { setDraft(old => old ? { ...old, ...patch } : old); }
  function cancel() { setDraft(null); onEditing(false); setError(""); void load(); }
  async function save(record: MemberRecord, closeEditor = true) {
    if (saving || documentBusy) return;
    if (!validMemberRecord(record)) { setError("Kiểm tra thời điểm, số đo, kết quả xét nghiệm và độ dài nội dung. Huyết áp cần đủ hai số; bản ghi dài nên tách thành từng lần khám."); return; }
    setSaving(true); setError("");
    try {
      const result = await request<{ record: MemberRecord }>(`/api/family/members/${member.id}/records`, record);
      if (!validMemberRecord(result.record)) throw new Error("Chưa xác nhận được bản lưu. Hãy thử lại.");
      if (closeEditor) { setDraft(null); onEditing(false); }
      if (!record.deleted && closeEditor) { setSavedRecord(record.id); setDocumentPanels(old => [...new Set([...old, record.id])]); }
      setMessage(record.deleted ? "Đã chuyển vào mục Đã xóa; có thể khôi phục." : "Đã lưu vào lịch sử.");
      await load();
      // Keep the just-saved older visit accessible even outside the first page/filter.
      if (closeEditor && !record.deleted) setRecords(old => old.some(row => row.id === result.record.id) ? old : [result.record, ...old]);
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }
  const metric = FAMILY_METRICS.find(m => m.key === draft?.metric);
  return <section className="member-records" aria-label={`Lịch sử của ${member.preferredName || member.fullName}`}>
    <div className="member-actions"><button className="btn btn-primary" onClick={() => begin(undefined, true)} disabled={member.archived || saving || documentBusy || !!draft}>Thêm bệnh án / lần khám</button>
      <button className="btn btn-quiet" onClick={() => begin()} disabled={member.archived || saving || documentBusy || !!draft}>Ghi số đo / sự kiện</button>
      <button className="btn btn-quiet" disabled={saving || documentBusy || !!draft} onClick={() => { setRecords([]); setDeleted(v => !v); }}>{deleted ? "Đang lưu" : "Đã xóa"}</button></div>
    <p className="state-note">Hồ sơ sức khỏe của {member.preferredName || member.fullName}, gồm mọi chuyên khoa, không chỉ thai kỳ. Mỗi lần khám hoặc đo được lưu riêng theo giờ.</p>
    {latest.length ? <details className="member-group"><summary>Số đo gần nhất</summary><dl className="member-latest">{latest.map(r => <div key={r.id}>
      <dt>{r.title}</dt><dd><strong>{r.value}{r.secondaryValue !== null ? ` / ${r.secondaryValue}` : ""} {r.unit}</strong><small>{displayTime(r.occurredAt)}{r.measurementContext && r.measurementContext !== "unspecified" ? ` · ${MEASUREMENT_CONTEXTS[r.measurementContext]}` : ""}</small></dd>
    </div>)}</dl></details> : null}
    {error ? <p role="alert" className="state-note is-wait">{error} <button className="btn btn-quiet" disabled={saving} onClick={() => void load()}>Tải lại lịch sử</button></p> : null}
    {message ? <p role="status" className="state-note">{message}</p> : null}
    {draft ? <form className="member-form member-record-editor" ref={editor} onSubmit={e => { e.preventDefault(); void save(draft); }}>
      <fieldset disabled={saving}>
        <legend>{draft.revision ? "Sửa bản ghi" : "Bản ghi mới"}</legend>
        {draft.pregnancyMemory ? <Link href="/ky-niem/thai-ky">Sửa ảnh và tuần tại Kỷ niệm thai kỳ</Link> : null}
        <label>Loại bản ghi<select disabled={!!draft.pregnancyMemory} value={draft.kind} onChange={e => {
          const kind = e.target.value as RecordKind;
          change({ kind, measurementContext: "unspecified", metric: kind === "measurement" ? "weight" : null, value: null, secondaryValue: null,
            unit: kind === "measurement" ? "kg" : null, title: kind === "measurement" ? "Cân nặng" : "" });
        }}>{Object.entries(RECORD_KINDS).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        {draft.kind === "measurement" ? <>
          <label>Chỉ số<select value={draft.metric ?? ""} onChange={e => { const m = FAMILY_METRICS.find(item => item.key === e.target.value)!;
            change({ metric: m.key, title: m.label, unit: m.unit, value: null, secondaryValue: null });
          }}>{FAMILY_METRICS.map(m => <option value={m.key} key={m.key}>{m.label} ({m.unit})</option>)}</select></label>
          <div className="member-fields"><label>{metric?.secondary ? "Tâm thu" : "Giá trị"} ({draft.unit})<input type="number" inputMode="decimal" required step="any" min={metric?.min} max={metric?.max}
            value={draft.value ?? ""} onChange={e => change({ value: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            {metric?.secondary ? <label>Tâm trương (mmHg)<input type="number" required inputMode="decimal" step="any" min={metric.min} max={metric.max}
              value={draft.secondaryValue ?? ""} onChange={e => change({ secondaryValue: e.target.value === "" ? null : Number(e.target.value) })} /></label> : null}</div>
        </> : <label>Tiêu đề<input required maxLength={160} value={draft.title} onChange={e => change({ title: e.target.value })} placeholder="Ví dụ: khám mắt, tiêm chủng, mọc chiếc răng đầu tiên" /></label>}
        {draft.kind === "measurement" ? <label>Bối cảnh lần đo<select value={draft.measurementContext ?? "unspecified"} onChange={e => change({ measurementContext: e.target.value as MemberRecord["measurementContext"] })}>
          {Object.entries(MEASUREMENT_CONTEXTS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select></label> : null}
        <label>Thời điểm ghi nhận<input type="datetime-local" required value={draft.occurredAt ? localTime(draft.occurredAt) : ""}
          onChange={e => change({ occurredAt: e.target.value ? new Date(e.target.value).toISOString() : "" })} /></label>
        <label>Nguồn / cơ sở khám<input maxLength={160} value={draft.source} onChange={e => change({ source: e.target.value })} /></label>
        <ClinicalRecordFields record={draft} onChange={change} />
        <label>Chi tiết & bối cảnh<textarea rows={3} maxLength={2000} value={draft.notes} onChange={e => change({ notes: e.target.value })}
          placeholder="Ví dụ: đo trước / sau ăn, kết quả bác sĩ, phản ứng sau tiêm, hướng dẫn chăm sóc…" /></label>
        <label>Ngày cần theo dõi lại (nếu có)<input type="date" value={draft.nextDueDate ?? ""} onChange={e => change({ nextDueDate: e.target.value || null })} /></label>
        <p className="state-note">Lưu bản ghi xong có thể chụp hoặc chọn giấy tờ. Ngày theo dõi lại chưa tự tạo lịch nhắc.</p>
      </fieldset>
      <div className="member-actions"><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Đang lưu…" : "Lưu bản ghi"}</button>
        <button type="button" className="btn btn-quiet" disabled={saving} onClick={cancel}>Hủy thay đổi</button></div>
    </form> : null}
    <form className="member-form" aria-label="Tìm bệnh án" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); }}>
      <fieldset disabled={saving || documentBusy || !!draft}><label>Tìm trong lịch sử<input type="search" maxLength={160} placeholder="Tên bệnh, cơ sở khám, bác sĩ…" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <div className="member-fields"><label>Lọc loại bản ghi<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">Tất cả</option>{Object.entries(RECORD_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button type="submit" className="btn btn-quiet">Tìm hồ sơ</button></div>
        {filter || query ? <button type="button" className="btn btn-quiet" onClick={() => { setFilter(''); setQuery(''); setSearch(''); }}>Xóa bộ lọc</button> : null}
      </fieldset>
    </form>
    {loading ? <p role="status">Đang tải lịch sử…</p> : !records.length && !error ? <p className="state-note">{filter || query ? "Không có hồ sơ khớp bộ lọc." : deleted ? "Không có bản ghi đã xóa." : "Chưa có bản ghi. Thêm lần khám, bệnh án hoặc số đo để bắt đầu."}</p> : null}
    <ol className="member-history">{records.map(record => <li key={record.id}>
      <div><strong>{record.title}</strong>{record.kind === "measurement" ? <p className="member-value">{record.value}{record.secondaryValue !== null ? ` / ${record.secondaryValue}` : ""} <small>{record.unit}</small></p> : null}
        <small>{displayTime(record.occurredAt)} · {RECORD_KINDS[record.kind]}{record.measurementContext && record.measurementContext !== "unspecified" ? ` · ${MEASUREMENT_CONTEXTS[record.measurementContext]}` : ""}</small></div>
      <details><summary>Chi tiết</summary><p>{record.notes || "Không có ghi chú thêm."}</p><p>Nguồn: {record.source || "Chưa ghi"}</p>
        <ClinicalRecordDetails record={record} />
        {record.nextDueDate ? <p>Theo dõi lại: {record.nextDueDate.split("-").reverse().join("/")}</p> : null}
        <p>Cập nhật: {record.updatedAt ? displayTime(record.updatedAt) : "Chưa rõ"} · Bản {record.revision}</p>
      </details>
      {!record.deleted ? <details open={savedRecord === record.id ? true : undefined} onToggle={e => {
        if (e.currentTarget.open) setDocumentPanels(old => old.includes(record.id) ? old : [...old, record.id]);
      }}><summary>Ảnh / PDF đính kèm</summary>{documentPanels.includes(record.id) ? <FamilyRecordDocuments memberId={member.id} recordId={record.id}
        readOnly={member.archived || saving || documentBusy || !!draft} onBusy={busy => { setDocumentBusy(busy); onEditing(busy || !!draft); }} /> : null}</details> : null}
      <div className="member-actions">{!record.deleted ? <button className="btn btn-quiet" disabled={saving || documentBusy || !!draft || member.archived} onClick={() => { begin(record); setTimeout(() => editor.current?.scrollIntoView({ block: "start" }), 0); }}>Sửa</button> : null}
        <button className="btn btn-quiet" disabled={saving || documentBusy || !!draft || member.archived} onClick={() => void save({ ...record, deleted: !record.deleted }, false)}>{record.deleted ? "Khôi phục" : "Xóa"}</button></div>
    </li>)}</ol>
    {nextOffset !== null ? <button className="btn btn-quiet btn-block" disabled={loading || saving || documentBusy} onClick={() => void load(nextOffset)}>Xem thêm lịch sử</button> : null}
  </section>;
}

function MemberRevisions({ id }: { id: string }) {
  const [history, setHistory] = useState<{ id: number; kind: "profile" | "record"; revision: number; changedAt: string; snapshot: FamilyMember | MemberRecord }[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true); setError("");
    try { const data = await request<{ history: NonNullable<typeof history> }>(`/api/family/members/${id}/history`); setHistory(data.history); }
    catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }
  return <details className="member-group" onToggle={e => { if (e.currentTarget.open && !loading) void load(); }}>
    <summary>Lịch sử chỉnh sửa</summary>
    <p className="state-note">50 bản trước khi chỉnh sửa gần nhất. Cả Hiếu và Ngân đều xem được.</p>
    {loading ? <p role="status">Đang tải…</p> : null}
    {error ? <p role="alert">{error} <button className="btn btn-quiet" onClick={() => void load()}>Thử lại</button></p> : null}
    {history?.length === 0 ? <p>Chưa có chỉnh sửa.</p> : null}
    {history?.map(row => <details className="member-revision" key={row.id}><summary>{row.kind === "profile" ? "Thông tin cá nhân" : "Bản ghi"} · bản {row.revision} · {displayTime(row.changedAt)}</summary>
      {"fullName" in row.snapshot ? <>
        <p>{row.snapshot.fullName} · {row.snapshot.preferredName} · {row.snapshot.birthDate ?? "Chưa có ngày sinh"}</p>
        <dl>{PROFILE_HISTORY_FIELDS.filter(f => (row.snapshot as FamilyMember).details[f.key]).map(f => <div key={f.key}><dt>{f.label}</dt><dd>{(row.snapshot as FamilyMember).details[f.key]}</dd></div>)}</dl>
      </> : <><p>{row.snapshot.title}: {row.snapshot.value}{row.snapshot.secondaryValue !== null ? ` / ${row.snapshot.secondaryValue}` : ""} {row.snapshot.unit}</p>
        <p>{displayTime(row.snapshot.occurredAt)} · {row.snapshot.source}{row.snapshot.measurementContext ? ` · ${MEASUREMENT_CONTEXTS[row.snapshot.measurementContext]}` : ""}</p><p>{row.snapshot.notes}</p><ClinicalRecordDetails record={row.snapshot} /><p>{row.snapshot.deleted ? "Đã xóa" : "Đang lưu"}</p></>}
    </details>)}
  </details>;
}
