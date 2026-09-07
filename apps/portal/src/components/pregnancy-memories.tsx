"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { validMemberRecord, type FamilyMember, type MemberRecord } from "../lib/family-members";
import { pregnancyMemoryGroups } from "../lib/pregnancy-memories";
import { calculatePregnancyWeek } from "../lib/pregnancy";
import { dateInVietnam } from "../lib/family-task-contract";
import type { MediaMemory } from "../lib/media";
import { toLocalDateTime } from "../lib/photo-metadata";
import PhotoComposer from "./photo-composer";
import { PhotoViewer } from "./memory-grid";
import "./daily-care-tools.css";
import "./pregnancy-memories.css";

async function api<T>(url: string, value?: unknown): Promise<T> {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000), ...(value === undefined ? {} : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value)
  }) });
  if (!r.ok) throw new Error(r.status === 409 ? "Bản ghi đã thay đổi hoặc ảnh chưa sẵn sàng. Giữ nội dung đang nhập, tải lại danh sách trước khi thử lại."
    : r.status === 401 ? "Cần đăng nhập lại để xem kỷ niệm." : "Chưa kết nối được. Nội dung đang nhập vẫn được giữ trong trang này.");
  return r.json() as Promise<T>;
}

export default function PregnancyMemories() {
  const [memberId, setMemberId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [records, setRecords] = useState<MemberRecord[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<MemberRecord | null>(null);
  const [photos, setPhotos] = useState<MediaMemory[]>([]);
  const [photoOffset, setPhotoOffset] = useState(0);
  const [morePhotos, setMorePhotos] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoDate, setPhotoDate] = useState("");
  const [viewer, setViewer] = useState<{ photos: MediaMemory[]; index: number } | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [comparison, setComparison] = useState(50);
  const [card, setCard] = useState<{ file: File; url: string } | null>(null);
  const loadId = useRef(0); const saveLock = useRef(false); const photoRequest = useRef(0);

  async function list(id: string, trash: boolean, offset = 0) {
    const sequence = ++loadId.current; setLoading(true);
    try {
      const data = await api<{ records: MemberRecord[]; nextOffset: number | null }>(`/api/family/members/${id}/records?collection=pregnancy&deleted=${trash}&offset=${offset}`);
      if (!Array.isArray(data.records) || !data.records.every(r => validMemberRecord(r) && r.pregnancyMemory)) throw new Error("Chưa đọc được album theo tuần.");
      if (sequence !== loadId.current) return;
      setRecords(old => offset ? [...new Map([...old, ...data.records].map(r => [r.id, r])).values()] : data.records);
      setNextOffset(data.nextOffset); setDeleted(trash);
    } catch (err) { if (sequence === loadId.current) setMessage((err as Error).message); }
    finally { if (sequence === loadId.current) setLoading(false); }
  }
  async function initialize() {
    setLoading(true); setMessage("");
    try {
      const [family, pregnancy] = await Promise.all([api<{ members: FamilyMember[] }>("/api/family/members"), api<{ profile: { dueDate: string | null } }>("/api/pregnancy/profile")]);
      const mother = family.members.find(m => m.role === "mother" && !m.archived);
      if (!mother) throw new Error("Chưa có hồ sơ Mẹ. Mở Nhà mình để kiểm tra.");
      setMemberId(mother.id); setDueDate(pregnancy.profile.dueDate ?? ""); await list(mother.id, false);
    } catch (err) { setMessage((err as Error).message); setLoading(false); }
  }
  useEffect(() => { void initialize(); return () => { loadId.current++; photoRequest.current++; }; }, []);
  useEffect(() => () => { if (card) URL.revokeObjectURL(card.url); }, [card]);

  async function loadPhotos(offset = 0, date = photoDate) {
    const sequence = ++photoRequest.current; setPhotoLoading(true);
    try {
      const data = await api<{ memories: MediaMemory[]; hasMore: boolean }>(`/api/memories?limit=24&offset=${offset}${date ? `&date=${date}` : ""}`);
      if (sequence !== photoRequest.current) return;
      setPhotos(old => offset ? [...new Map([...old, ...data.memories].map(p => [p.id, p])).values()] : data.memories);
      setPhotoOffset(offset + 24); setMorePhotos(data.hasMore);
    } catch (err) { if (sequence === photoRequest.current) setMessage((err as Error).message); }
    finally { if (sequence === photoRequest.current) setPhotoLoading(false); }
  }
  function start(record?: MemberRecord) {
    setMessage(""); setCard(null);
    setDraft(record ?? { id: crypto.randomUUID(), memberId, kind: "development", title: "Một tuần bên con", notes: "", source: "Kỷ niệm thai kỳ",
      occurredAt: new Date().toISOString(), nextDueDate: null, metric: null, value: null, secondaryValue: null, unit: null, revision: 0, deleted: false,
      pregnancyMemory: { dueDate, week: calculatePregnancyWeek(dueDate) ?? 1, mediaIds: [] } });
    void loadPhotos(0, ""); setPhotoDate("");
  }
  function patch(p: Partial<MemberRecord>) { setDraft(old => old ? { ...old, ...p } : null); }
  function pick(photo: MediaMemory) {
    if (!draft?.pregnancyMemory) return;
    const ids = draft.pregnancyMemory.mediaIds;
    if (!ids.includes(photo.id) && ids.length >= 12) { setMessage("Mỗi lần chọn tối đa 12 ảnh. Có thể thêm một lượt nữa vào cùng tuần."); return; }
    const first = !ids.length && draft.revision === 0;
    patch({ ...(first ? { occurredAt: photo.eventAt } : {}), pregnancyMemory: { ...draft.pregnancyMemory,
      week: first ? calculatePregnancyWeek(draft.pregnancyMemory.dueDate, new Date(photo.eventAt)) ?? draft.pregnancyMemory.week : draft.pregnancyMemory.week,
      mediaIds: ids.includes(photo.id) ? ids.filter(id => id !== photo.id) : [...ids, photo.id] } });
  }
  async function save(record: MemberRecord, close = true) {
    if (saveLock.current) return;
    if (!validMemberRecord(record)) { setMessage("Chọn ảnh, kiểm tra ngày chụp, ngày dự sinh và tuần từ 1–42 trước khi lưu."); return; }
    saveLock.current = true; setSaving(true); setMessage("");
    try {
      await api(`/api/family/members/${memberId}/records`, record);
      if (close) setDraft(null);
      setMessage(record.deleted ? "Đã cất vào mục đã xóa. Ảnh gốc vẫn giữ nguyên." : "Đã lưu kỷ niệm.");
      await list(memberId, deleted);
    } catch (err) { setMessage((err as Error).message); } finally { saveLock.current = false; setSaving(false); }
  }
  async function view(ids: string[]) {
    setMessage("");
    try {
      const data = await api<{ memories: MediaMemory[] }>(`/api/memories?ids=${ids.slice(0, 12).join(",")}`);
      const ordered = ids.flatMap(id => data.memories.filter(p => p.id === id));
      if (!ordered.length) throw new Error("Ảnh đang đồng bộ hoặc đã được gỡ khỏi kho xem. Mốc tuần vẫn được giữ.");
      setViewer({ photos: ordered, index: 0 });
    } catch (err) { setMessage((err as Error).message); }
  }

  async function makeCard(record: MemberRecord) {
    if (!record.pregnancyMemory || saving) return;
    setSaving(true); setMessage(""); setCard(null);
    let imageUrl = "";
    try {
      const r = await fetch(`/api/media/${record.pregnancyMemory.mediaIds[0]}`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error();
      imageUrl = URL.createObjectURL(await r.blob());
      const image = new Image(); image.src = imageUrl; await image.decode();
      await document.fonts.ready;
      const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = 1440;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error();
      ctx.fillStyle = "#fff5f7"; ctx.fillRect(0, 0, 1080, 1440);
      const scale = Math.min(984 / image.width, 960 / image.height);
      ctx.drawImage(image, (1080 - image.width * scale) / 2, 48 + (960 - image.height * scale) / 2, image.width * scale, image.height * scale);
      ctx.fillStyle = "#793d56"; ctx.textAlign = "center";
      const font = getComputedStyle(document.body).fontFamily;
      ctx.font = `600 52px ${font}`; ctx.fillText(`Tuần ${record.pregnancyMemory.week} bên con`, 540, 1110, 960);
      ctx.font = `400 34px ${font}`; ctx.fillText(record.title, 540, 1180, 960);
      ctx.font = `400 28px ${font}`; ctx.fillText(new Date(record.occurredAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }), 540, 1260);
      ctx.fillText("Kỷ niệm của hai mình · EmBe", 540, 1360);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error()), "image/png"));
      const file = new File([blob], `embe-tuan-${record.pregnancyMemory.week}.png`, { type: "image/png" });
      setCard({ file, url: URL.createObjectURL(file) });
    } catch { setMessage("Chưa tạo được thiệp. Ảnh gốc vẫn giữ nguyên; thử lại khi có mạng."); }
    finally { if (imageUrl) URL.revokeObjectURL(imageUrl); setSaving(false); }
  }
  async function shareCard() {
    if (!card) return;
    try {
      if (navigator.canShare?.({ files: [card.file] }) && navigator.share) await navigator.share({ files: [card.file], title: "Kỷ niệm thai kỳ" });
      else { const a = document.createElement("a"); a.href = card.url; a.download = card.file.name; a.click(); }
    } catch (err) { if ((err as Error).name !== "AbortError") setMessage("Chưa mở được chia sẻ. Có thể dùng nút Tải thiệp."); }
  }
  const groups = pregnancyMemoryGroups(records);
  return <section className="care-inline bump-workspace">
    <p>Chỉ ảnh mình chọn mới vào album theo tuần. Không tự đưa ảnh siêu âm / hồ sơ khám vào đây.</p>
    <div className="care-inline-actions"><button type="button" disabled={!memberId || loading || saving || !!draft} onClick={() => start()}>Thêm kỷ niệm theo tuần</button>
      <button type="button" disabled={loading || saving || !!draft} onClick={() => memberId ? void list(memberId, !deleted) : void initialize()}>{deleted ? "Đang lưu" : "Đã xóa"}</button>
      <button type="button" disabled={loading || saving} onClick={() => memberId ? void list(memberId, deleted) : void initialize()}>Tải lại</button></div>
    {loading ? <p role="status">Đang mở album…</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {draft?.pregnancyMemory ? <form className="care-inline-form bump-editor" onSubmit={(e: FormEvent) => { e.preventDefault(); void save(draft); }}>
      <fieldset disabled={saving}><legend>{draft.revision ? "Sửa kỷ niệm" : "Một mốc muốn nhớ"}</legend>
        <label>Tiêu đề<input maxLength={160} required value={draft.title} onChange={e => patch({ title: e.target.value })} /></label>
        <label>Ngày chụp / ghi nhớ<input type="datetime-local" required value={toLocalDateTime(draft.occurredAt)} onChange={e => { if (e.target.value) patch({ occurredAt: new Date(e.target.value).toISOString() }); }} /></label>
        <label>Ngày dự sinh của hành trình<input type="date" required value={draft.pregnancyMemory.dueDate} onChange={e => patch({ pregnancyMemory: { ...draft.pregnancyMemory!, dueDate: e.target.value } })} /></label>
        <label>Tuần thai — có thể sửa<input type="number" min={1} max={42} required value={draft.pregnancyMemory.week} onChange={e => patch({ pregnancyMemory: { ...draft.pregnancyMemory!, week: Number(e.target.value) } })} /></label>
        <label>Điều muốn nhớ<textarea rows={2} maxLength={2000} value={draft.notes} onChange={e => patch({ notes: e.target.value })} /></label>
        <details><summary>Tải ảnh mới từ điện thoại</summary><PhotoComposer /><p>Đợi ảnh đồng bộ xong rồi chạm “Tải lại ảnh” để chọn. Không cần tải ảnh lên lần hai.</p></details>
        <label>Tìm ảnh theo ngày<input type="date" value={photoDate} onChange={e => { setPhotoDate(e.target.value); void loadPhotos(0, e.target.value); }} /></label>
        <button type="button" disabled={photoLoading} onClick={() => void loadPhotos()}>Tải lại ảnh</button>
        <p>Đã chọn {draft.pregnancyMemory.mediaIds.length}/12 ảnh. Có thể bỏ từng ảnh trước khi lưu.</p>
        {draft.pregnancyMemory.mediaIds.length ? <div className="bump-picks">{draft.pregnancyMemory.mediaIds.map((id, i) => <button type="button" key={id} aria-label={`Bỏ ảnh đã chọn ${i + 1}`} onClick={() => patch({ pregnancyMemory: { ...draft.pregnancyMemory!, mediaIds: draft.pregnancyMemory!.mediaIds.filter(p => p !== id) } })}><img src={`/api/media/${id}`} alt={`Ảnh đã chọn ${i + 1}`} />Bỏ ảnh {i + 1}</button>)}</div> : null}
        <div className="bump-photo-picker">{photos.map(p => <button type="button" key={p.id} aria-pressed={draft.pregnancyMemory!.mediaIds.includes(p.id)} aria-label={`Chọn ${p.title}`} onClick={() => pick(p)}><img loading="lazy" src={`/api/media/${p.id}`} alt="" /><span>{p.title}<small>{new Date(p.eventAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</small></span></button>)}</div>
        {photoLoading ? <p>Đang tải ảnh…</p> : !photos.length ? <p>Chưa thấy ảnh trong lựa chọn này. Thử ngày khác hoặc tải lại sau khi đồng bộ.</p> : null}
        {morePhotos ? <button type="button" disabled={photoLoading} onClick={() => void loadPhotos(photoOffset)}>Ảnh tiếp theo</button> : null}
      </fieldset><div className="care-inline-actions"><button type="submit" disabled={saving || !draft.pregnancyMemory.mediaIds.length}>{saving ? "Đang lưu…" : "Lưu kỷ niệm"}</button><button type="button" disabled={saving} onClick={() => setDraft(null)}>Hủy thay đổi</button></div>
    </form> : null}
    {card ? <section className="bump-card-preview"><h2>Thiệp đã sẵn sàng</h2><img src={card.url} alt="Thiệp kỷ niệm vừa tạo" /><div className="care-inline-actions"><button type="button" onClick={() => void shareCard()}>Chia sẻ thiệp</button><a href={card.url} download={card.file.name}>Tải thiệp</a><button type="button" onClick={() => setCard(null)}>Đóng</button></div><p>Thiệp được tạo trên điện thoại, không tự tạo link công khai hay gửi cho ai.</p></section> : null}
    {compare.length === 2 ? <section className="bump-comparison"><h2>Hai khoảnh khắc bên con</h2><div className="bump-overlay"><img src={`/api/media/${compare[0]}`} alt="Khoảnh khắc thứ nhất" /><img src={`/api/media/${compare[1]}`} alt="Khoảnh khắc thứ hai" style={{ opacity: comparison / 100 }} /></div><label>Kéo để xem ảnh trước / sau<input type="range" min={0} max={100} value={comparison} onChange={e => setComparison(Number(e.target.value))} /></label><button type="button" onClick={() => setCompare([])}>Bỏ so sánh</button><p>Chỉ để xem kỷ niệm, không đánh giá kích thước hay sức khỏe thai nhi.</p></section> : null}
    {!loading && !records.length ? <p>{deleted ? "Chưa có kỷ niệm đã xóa." : "Chưa có ảnh bụng bầu theo tuần. Chọn ảnh đầu tiên khi Mẹ thấy thoải mái."}</p> : null}
    {deleted ? records.map(record => <article key={record.id}><p>{record.title} · tuần {record.pregnancyMemory?.week}</p><button type="button" disabled={saving} onClick={() => void save({ ...record, deleted: false }, false)}>Khôi phục</button></article>) : groups.map(group => <article className="bump-week" key={group.key}>
      <h2>Tuần {group.week}<small>Hành trình dự sinh {group.dueDate.split("-").reverse().join("/")}</small></h2>
      <button type="button" className="bump-cover" onClick={() => void view(group.mediaIds)} aria-label={`Xem ảnh tuần ${group.week}`}><img loading="lazy" src={`/api/media/${group.mediaIds[0]}`} alt={`Kỷ niệm tuần ${group.week}`} /></button>
      {group.mediaIds.length > 12 ? <div className="care-inline-actions">{Array.from({ length: Math.ceil(group.mediaIds.length / 12) }, (_, i) => <button type="button" key={i} onClick={() => void view(group.mediaIds.slice(i * 12, (i + 1) * 12))}>Ảnh {i * 12 + 1}–{Math.min(group.mediaIds.length, (i + 1) * 12)}</button>)}</div> : null}
      <button type="button" aria-pressed={compare.includes(group.mediaIds[0])} onClick={() => setCompare(old => old.includes(group.mediaIds[0]) ? old.filter(id => id !== group.mediaIds[0]) : [...old.slice(-1), group.mediaIds[0]])}>{compare.includes(group.mediaIds[0]) ? "Đã chọn so sánh" : "Chọn ảnh so sánh"}</button>
      {group.records.map(record => <details key={record.id}><summary>{record.title} · {record.pregnancyMemory!.mediaIds.length} ảnh</summary><p>{record.notes}</p><Link href={`/lich?date=${dateInVietnam(new Date(record.occurredAt))}`}>Xem ngày trên lịch</Link><div className="care-inline-actions"><button type="button" disabled={saving || !!draft} onClick={() => start(record)}>Sửa</button><button type="button" disabled={saving} onClick={() => void makeCard(record)}>Tạo thiệp</button><button type="button" disabled={saving || !!draft} onClick={() => { if (window.confirm("Cất kỷ niệm vào mục đã xóa? Ảnh gốc vẫn giữ nguyên.")) void save({ ...record, deleted: true }, false); }}>Xóa khỏi tuần</button></div></details>)}
    </article>)}
    {nextOffset !== null ? <button type="button" disabled={loading} onClick={() => void list(memberId, deleted, nextOffset)}>Xem thêm kỷ niệm</button> : null}
    {viewer ? <PhotoViewer key={viewer.photos[viewer.index].id} memory={viewer.photos[viewer.index]} index={viewer.index} total={viewer.photos.length} onClose={() => setViewer(null)} onMove={direction => setViewer(v => v ? { ...v, index: (v.index + direction + v.photos.length) % v.photos.length } : null)} onMetadataSaved={memory => setViewer(v => v ? { ...v, photos: v.photos.map(p => p.id === memory.id ? memory : p) } : null)} /> : null}
  </section>;
}
