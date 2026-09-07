'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cleanReferenceUrl, discoveryKey, editorialBrief, mergeBoard, niches, parseTrendFeed, searchLinks, seedReferences, validateBoard, velocity, type DiscoveryItem, type NicheId, type TrendSignal } from '../lib/studio-discovery';

function saveFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function SourceEditor({ item, onSave, onDelete }: { item: DiscoveryItem; onSave: (item: DiscoveryItem) => Promise<boolean>; onDelete: () => void }) {
  const [message, setMessage] = useState('');
  return <details className="studio-disclosure"><summary>Sửa ý tưởng & ghi số liệu</summary>
    <form onSubmit={async e => { e.preventDefault(); const data = new FormData(e.currentTarget); if (await onSave({ ...item, title: String(data.get('title')), note: String(data.get('note')), status: data.get('status') as DiscoveryItem['status'] })) setMessage('Đã lưu thay đổi.'); }}>
      <label className="studio-search">Tên ý tưởng<input name="title" defaultValue={item.title} required maxLength={180} /></label>
      <label className="studio-search">Góc nhìn riêng<textarea name="note" defaultValue={item.note} maxLength={1500} rows={3} /></label>
      <label className="studio-filter">Trạng thái<select name="status" defaultValue={item.status}><option value="saved">Đang tham khảo</option><option value="draft">Đã chọn để viết</option></select></label>
      <button className="discovery-button" type="submit">Lưu thay đổi</button>
    </form>
    <form className="discovery-snapshot" onSubmit={async e => {
      e.preventDefault(); const data = new FormData(e.currentTarget);
      try {
        const count = (key: string) => String(data.get(key)).trim() === '' ? null : Number(data.get(key));
        const next = { ...item, snapshots: [...item.snapshots, { at: new Date(String(data.get('at'))).toISOString(), likes: count('likes'), saves: count('saves'), shares: count('shares') }] };
        validateBoard([next]); if (await onSave(next)) setMessage('Đã lưu lần ghi nhận.');
      } catch { setMessage('Kiểm tra ngày giờ và số nguyên không âm. Tối đa 50 lần ghi nhận.'); }
    }}>
      <p>Số liệu nhập từ bài gốc. Để trống nếu không thấy; không điền 0 thay cho thiếu dữ liệu.</p>
      <label className="studio-search">Giờ ghi nhận<input name="at" type="datetime-local" defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16)} required /></label>
      <div className="discovery-metrics">{[['likes', 'Thích'], ['saves', 'Lưu'], ['shares', 'Chia sẻ']].map(([key, label]) => <label className="studio-search" key={key}>{label}<input name={key} type="number" min="0" max="1000000000000" step="1" inputMode="numeric" /></label>)}</div>
      <button className="discovery-button" type="submit">Ghi số liệu</button><p role="status">{message}</p>
      {!!item.snapshots.length && <ul>{item.snapshots.map(s => <li key={s.at}>{new Date(s.at).toLocaleString('vi-VN')} — thích {s.likes ?? '?'}, lưu {s.saves ?? '?'}, chia sẻ {s.shares ?? '?'}<button className="discovery-button" type="button" onClick={async () => { if (await onSave({ ...item, snapshots: item.snapshots.filter(old => old.at !== s.at) })) setMessage('Đã bỏ lần ghi nhận sai.'); }}>Bỏ lần ghi này</button></li>)}</ul>}
    </form><button className="discovery-button" onClick={onDelete}>Xóa ý tưởng</button>
  </details>;
}
export default function StudioDiscovery() {
  const [nicheId, setNicheId] = useState<NicheId>('food'); const [language, setLanguage] = useState<'vi' | 'zh' | 'en'>('vi'); const [custom, setCustom] = useState<string | null>(null);
  const boardRevision = useRef(0); const writeInFlight = useRef(false); const [writing, setWriting] = useState(false);
  const [board, setBoard] = useState<DiscoveryItem[]>([]); const [loaded, setLoaded] = useState(false); const stored = useRef<string | null>(null); const [message, setMessage] = useState(''); const [removed, setRemoved] = useState<DiscoveryItem | null>(null);
  const [signals, setSignals] = useState<TrendSignal[]>([]); const [checkedAt, setCheckedAt] = useState(''); const [feedState, setFeedState] = useState('Đang lấy tín hiệu…'); const [busy, setBusy] = useState(false); const feedInFlight = useRef(false); const [allSignals, setAllSignals] = useState(false);
  const niche = niches.find(n => n.id === nicheId)!;
  const loadBoard = useCallback(async () => {
    if (writeInFlight.current) return;
    try { const response = await fetch('/api/studio/workspace?board=1', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(); const data = await response.json(); const valid = validateBoard(data.items);
      boardRevision.current = data.revision; stored.current = JSON.stringify(valid); setBoard(valid); setLoaded(true);
    } catch { setMessage('Chưa mở được sổ trên EmBe. Thử cập nhật lại; sổ cũ trên thiết bị không bị xóa.'); }
  }, []);
  useEffect(() => { void loadBoard(); }, [loadBoard]);
  const refresh = useCallback(async () => {
    if (feedInFlight.current) return; feedInFlight.current = true; setBusy(true);
    try { const response = await fetch('/api/studio/discovery', { cache: 'no-store', signal: AbortSignal.timeout(15000) }); const data = await response.json();
      if (!response.ok || data.status !== 'ready' || typeof data.xml !== 'string') throw new Error('source');
      setSignals(parseTrendFeed(data.xml)); setCheckedAt(data.checkedAt); setFeedState('Đã lấy tín hiệu từ Google Trends Việt Nam.');
    } catch { setFeedState('Nguồn tạm không lấy được. Kết quả cũ (nếu có) vẫn giữ; thử lại sau 15 phút. Tìm kiếm và sổ ý tưởng vẫn dùng được.'); }
    finally { feedInFlight.current = false; setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function persist(next: DiscoveryItem[], text = 'Đã lưu trên EmBe, dùng được trên điện thoại khác.') {
    if (!loaded || writeInFlight.current) return false;
    writeInFlight.current = true; setWriting(true);
    try { const valid = validateBoard(next);
      const response = await fetch('/api/studio/workspace', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ action: 'save-board', revision: boardRevision.current, items: valid }) });
      if (!response.ok) throw new Error(response.status === 409 ? 'Sổ đã đổi ở thiết bị khác. Giữ ghi chú đang nhập, cập nhật sổ trước khi lưu lại.' : 'Chưa lưu được lên EmBe. Nội dung vừa nhập vẫn giữ; thử lại khi có mạng.');
      const data = await response.json(); boardRevision.current = data.revision; stored.current = JSON.stringify(data.items); setBoard(validateBoard(data.items)); setMessage(text); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Chưa lưu được.'); return false; }
    finally { writeInFlight.current = false; setWriting(false); }
  }
  async function add(title: string, url: string, niche: NicheId, note = '') {
    try { const clean = cleanReferenceUrl(url); if (board.some(item => item.url === clean)) { setMessage('Liên kết này đã có trong sổ.'); return false; }
      return persist([...board, { id: crypto.randomUUID(), title, url: clean, niche, note, status: 'saved', snapshots: [] }]);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Liên kết không hợp lệ.'); return false; }
  }
  const visibleSignals = allSignals ? signals : signals.filter(signal => signal.relevant);
  return <>
    <section aria-label="Tìm theo chủ đề">
      <label className="studio-filter">Chủ đề<select value={nicheId} onChange={e => { setNicheId(e.target.value as NicheId); setCustom(null); }}>{niches.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label>
      <label className="studio-filter">Từ khóa<select value={language} onChange={e => { setLanguage(e.target.value as typeof language); setCustom(null); }}><option value="vi">Tiếng Việt</option><option value="zh">Tiếng Trung</option><option value="en">Tiếng Anh</option></select></label>
      <label className="studio-search">Có thể sửa từ khóa<input value={custom ?? niche[language]} onChange={e => setCustom(e.target.value)} maxLength={100} /></label>
      <div className="discovery-platforms">{searchLinks(niche, language, custom ?? '').map(link => <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer">{link.name}</a>)}</div>
      <p className="discovery-help">Mở tìm kiếm ở nền tảng gốc; có thể cần đăng nhập. Không gửi hồ sơ gia đình. Link tìm kiếm không có nghĩa EmBe đã thu thập kết quả.</p>
    </section>
    <details className="studio-disclosure"><summary>Tín hiệu mới tại Việt Nam{signals.length ? ` · ${signals.filter(s => s.relevant).length} có từ khóa liên quan` : ''}</summary>
      <p role="status">{feedState}</p>{checkedAt && <p>Lấy nguồn lúc {new Date(checkedAt).toLocaleString('vi-VN')}. Bộ đệm 15 phút; không theo dõi khi đóng ứng dụng.{Date.now() - Date.parse(checkedAt) > 3600000 ? ' Dữ liệu đã cũ, cần kiểm tra nguồn.' : ''}</p>}
      <p>Đây là xu hướng tìm kiếm Google, không phải lượt xem TikTok hay nhu cầu khám bệnh. Ghép từ khóa sơ bộ, không đoán sức khỏe; ngày bên dưới là mốc nguồn ghi, không phải ngày đăng video.</p>
      <div className="discovery-platforms"><button disabled={busy} onClick={() => void refresh()}>{busy ? 'Đang lấy…' : 'Cập nhật tín hiệu'}</button><button aria-pressed={allSignals} onClick={() => setAllSignals(!allSignals)}>{allSignals ? 'Chỉ xem liên quan' : 'Xem xu hướng chung'}</button></div>
      {!visibleSignals.length && !busy && <p>Chưa có từ khóa khớp trong nguồn hiện có. Điều này không có nghĩa chủ đề mẹ bầu không được quan tâm.</p>}
      <ul>{visibleSignals.map(s => <li className="discovery-source" key={s.title}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a><p>Lượng tìm kiếm nguồn ước tính: {s.volume}{s.startedAt ? ` · ${new Date(s.startedAt).toLocaleString('vi-VN')}` : ''}</p><button className="discovery-button" disabled={!loaded || writing} onClick={() => add(s.title, s.url, nicheId)}>Lưu làm ý tưởng</button></li>)}</ul>
      <a href="https://trends.google.com/trending?geo=VN" target="_blank" rel="noopener noreferrer">Đối chiếu Google Trends</a><a href="https://ads.tiktok.com/creative/creativeCenter/trends" target="_blank" rel="noopener noreferrer">Xem xu hướng tại TikTok Creative Center</a>
    </details>
    <details className="studio-disclosure"><summary>Những mẫu Rednote đã xem</summary><p>Học bố cục; không phải các bài đang tăng trưởng. Đã bỏ token khỏi link; nền tảng có thể yêu cầu mở lại bài từ kênh.</p><ul>{seedReferences.map(seed => <li className="discovery-source" key={seed.url}><a href={seed.url} target="_blank" rel="noopener noreferrer">{seed.title}</a><button className="discovery-button" disabled={!loaded || writing} onClick={() => add(seed.title, seed.url, seed.niche)}>Lưu mẫu này</button></li>)}</ul></details>
    <section aria-label="Sổ ý tưởng"><h2 className="studio-research-title">Sổ ý tưởng <small>({board.length})</small></h2>
      <fieldset className="studio-fields" disabled={writing}>
      <p className="discovery-help">Lưu riêng trên EmBe, mở được từ các điện thoại đã đăng nhập. Chỉ ghi ý tưởng công khai, không nhập thông tin sức khỏe riêng.</p>
      <p className="discovery-status" role="status" aria-live="polite">{message}</p>
      {removed && <button className="discovery-button" disabled={writing} onClick={async () => { try { if (await persist(mergeBoard(board, [removed]), 'Đã khôi phục ý tưởng.')) setRemoved(null); } catch { setMessage('Chưa khôi phục được: sổ đã đủ 200 ý tưởng.'); } }}>Hoàn tác xóa</button>}
      <details className="studio-disclosure"><summary>Thêm bài viết, video hoặc kênh</summary><form onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const data = new FormData(form); if (await add(String(data.get('title')), String(data.get('url')), nicheId, String(data.get('note')))) form.reset(); }}>
        <label className="studio-search">Tên ý tưởng<input name="title" required maxLength={180} /></label><label className="studio-search">Liên kết gốc<input name="url" type="url" required maxLength={2048} placeholder="https://…" /></label><label className="studio-search">Điều muốn học hoặc làm khác<textarea name="note" rows={2} maxLength={1500} /></label><button className="discovery-button" disabled={!loaded || writing} type="submit">Lưu ý tưởng</button>
      </form></details>
      <details className="studio-disclosure"><summary>Sao lưu & nhập sổ cũ</summary><button className="discovery-button" disabled={!loaded || writing} onClick={async () => { try { const local = localStorage.getItem(discoveryKey); if (!local) { setMessage('Không có sổ cũ trên thiết bị này.'); return; } await persist(mergeBoard(board, validateBoard(JSON.parse(local))), 'Đã nhập sổ cũ lên EmBe, không xóa bản trên thiết bị.'); } catch { setMessage('Chưa đọc được sổ cũ. Bản trên thiết bị vẫn giữ nguyên.'); } }}>Nhập sổ cũ trên thiết bị</button><p>File chứa toàn bộ sổ ý tưởng. Nhập sẽ thêm link mới, giữ nguyên link đã có; không ghi đè ghi chú.</p><button className="discovery-button" disabled={!loaded || !board.length} onClick={() => saveFile('embe-y-tuong.json', JSON.stringify({ version: 1, items: board }), 'application/json')}>Xuất sổ JSON</button>
        <label className="studio-search">Nhập sổ JSON<input type="file" accept="application/json,.json" disabled={!loaded || writing} onChange={async e => { const input = e.currentTarget; const file = input.files?.[0]; if (!file) return; try { if (file.size > 1000000) throw new Error('size'); const value = JSON.parse(await file.text()); if (value.version !== 1) throw new Error('version'); await persist(mergeBoard(validateBoard(JSON.parse(stored.current || '[]')), validateBoard(value.items)), 'Đã nhập link mới, giữ ghi chú hiện có.'); } catch { setMessage('Chưa nhập: file không đúng định dạng, quá 1 MB hoặc vượt 200 ý tưởng.'); } finally { input.value = ''; } }} /></label>
      </details>
      {!board.length && <p className="discovery-help">Chọn “Lưu mẫu này” hoặc thêm liên kết để bắt đầu. Chưa có số liệu giả hay bài “viral” được điền sẵn.</p>}
      <button className="discovery-button" disabled={writing} onClick={() => void loadBoard()}>Cập nhật sổ từ EmBe</button><ul className="studio-ideas">{board.map(item => <li key={item.id}><a className="studio-back" href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a><p>{niches.find(n => n.id === item.niche)?.label} · {item.status === 'draft' ? 'Đã chọn để viết' : 'Đang tham khảo'}</p><p>{velocity(item).label}</p>{item.note && <p>{item.note}</p>}<button className="discovery-button" onClick={() => saveFile('embe-dan-y.txt', editorialBrief(item), 'text/plain;charset=utf-8')}>Tải dàn ý EmBe</button><Link className="discovery-button" href={`/studio/soan?y-tuong=${encodeURIComponent(item.id)}`}>Viết kịch bản từ ý tưởng</Link><SourceEditor key={`${item.id}-${item.title}-${item.status}-${item.note}`} item={item} onSave={next => persist(board.map(old => old.id === item.id ? next : old))} onDelete={async () => { if (await persist(board.filter(old => old.id !== item.id), 'Đã xóa. Có thể hoàn tác trong lượt mở này.')) setRemoved(item); }} /></li>)}</ul>
      <p className="discovery-help">Tốc độ = chênh lệch số đếm / số giờ giữa hai lần, tối thiểu 1 giờ. Chỉ so cùng bài và cùng chỉ số; không xếp hạng chéo nền tảng, không chứng nhận “viral” hoặc đúng y khoa.</p>
      </fieldset>
    </section>
  </>;
}
