'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { automationLabels, type StudioAutomation as Automation } from '../lib/studio-automation';
import { renderLabels, renderErrors } from '../lib/studio-project';
import { useFamilyDataRefresh } from '../lib/use-family-data-refresh';

async function request(body?: { enabled: boolean; revision: number }): Promise<Automation> {
  const r = await fetch('/api/studio/automation', { cache: 'no-store', signal: AbortSignal.timeout(18000),
    ...(body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  if (!r.ok) throw new Error(r.status === 409 ? 'Cài đặt đã đổi trên thiết bị khác. Hãy cập nhật trạng thái trước khi đổi tiếp.' :
    r.status === 401 ? 'Cần đăng nhập lại EmBe để xem Studio.' : 'Chưa kết nối được Studio. Cài đặt trên máy chủ không bị thay đổi.');
  return r.json();
}
const localTime = (time: string) => new Date(time).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function StudioAutomation() {
  const [data,setData] = useState<Automation | null>(null), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const flight = useRef(false), generation = useRef(0), refreshing=useRef(false);
  async function refresh() {
    if (flight.current || refreshing.current) return;
    refreshing.current=true;
    const version = ++generation.current;
    try { const next = await request(); if (version === generation.current) { setData(next); setError(''); } }
    catch (e) { if (version === generation.current) setError((e as Error).message); }
    finally { refreshing.current=false; }
  }
  useEffect(() => { void refresh(); return () => { generation.current++; }; }, []);
  useEffect(()=>{
    // Poll only the visible status, never a draft or a mutation. Resume on reconnect.
    const update=()=>{if(navigator.onLine&&document.visibilityState!=='hidden')void refresh();};
    const timer=setInterval(update,15000);
    window.addEventListener('online',update);document.addEventListener('visibilitychange',update);
    return()=>{clearInterval(timer);window.removeEventListener('online',update);document.removeEventListener('visibilitychange',update);};
  },[]);
  useFamilyDataRefresh(async canApply => {
    const version = generation.current, next = await request();
    if (canApply() && !flight.current && version === generation.current) { setData(next); setError(''); }
  }, !!data && !busy);
  async function toggle() {
    if (!data || flight.current) return;
    flight.current = true; generation.current++; setBusy(true);
    try { setData(await request({ enabled: !data.enabled, revision: data.revision })); setError(''); }
    catch (e) { setError((e as Error).message); }
    finally { flight.current = false; setBusy(false); }
  }
  const workerOnline = !!data?.workerSeenAt && Date.now() - Date.parse(data.workerSeenAt) < 120000;
  const latest = data?.history.find(item => !item.deleted);
  return <section className="studio-automation" aria-label="Studio tự động">
    <div className="studio-scene-heading"><h2>Studio tự động</h2>{data && <button className="discovery-button" disabled={busy} onClick={() => void toggle()}>{busy ? 'Đang lưu…' : data.enabled ? 'Tạm dừng' : 'Tiếp tục tự tạo'}</button>}</div>
    {error && <p role="alert" className="discovery-status">{error} <button className="discovery-button" disabled={busy} onClick={() => void refresh()}>Cập nhật trạng thái</button></p>}
    {!data && !error && <p role="status" className="discovery-help">Đang lấy tiến độ tự động…</p>}
    {data && <>
      <p className="discovery-help">{data.enabled ? '1 video/ngày, lúc 08:00 giờ Việt Nam. EmBe tự chọn kịch bản, đọc giọng nữ miền Nam, ghép phụ đề và đưa vào hàng chờ duyệt.' : 'Đã tạm dừng tạo mới. Video đang dựng vẫn tiếp tục, bản đã có được giữ lại.'}</p>
      <p role="status" className="discovery-status">{automationLabels[data.status] || 'Đang lấy trạng thái.'}</p>
      {data.enabled && data.remaining > 0 && <p className="discovery-help">Lượt kế tiếp: {localTime(data.nextRunAt)}. Còn {data.remaining} chủ đề có nguồn trong thư viện.</p>}
      {!workerOnline && <p className="studio-notice">Máy dựng chưa kết nối gần đây. Video mới sẽ chờ máy nhà hoạt động; không cần mở trang này.</p>}
      {data.handoff&&<div className="studio-auto-handoff">
        <Link className="studio-back" href="/studio/duyet-dang">{data.handoff.pendingCount} video trong hàng chờ duyệt</Link>
        <p className="discovery-help">Không cần tự chuyển bản dựng. Trang cập nhật tiến độ khi đang mở; rời trang vẫn tiếp tục chạy.</p>
        {data.handoff.status==='failed'||data.handoff.status==='queue_full'?<p role="alert" className="discovery-status">{data.handoff.status==='failed'?'Chuyển hàng chờ đang lỗi; EmBe sẽ thử lại, video đã dựng không mất.':'Hàng chờ đã đầy; video mới vẫn được giữ trong Bàn làm việc.'}</p>:null}
        <p className="discovery-help">{data.handoff.devices?`Báo video mới trên ${data.handoff.devices} thiết bị đã bật thông báo, trong 08:00–21:00. Thông báo có thể đến chậm theo lượt gửi nền.`:'Chưa có thiết bị bật thông báo. Kết quả vẫn tự hiện tại Studio.'}</p>
      </div>}
      {latest && <div className="studio-auto-latest"><Link className="studio-back" href={`/studio/soan?du-an=${latest.project_id}`}>{latest.title}</Link>
        <p className="discovery-help">{latest.render_status ? renderLabels[latest.render_status] : 'Kịch bản đã lưu, sắp dựng'}{latest.render_status === 'rendering' ? ` · ${latest.progress}%` : ''}</p>
        {latest.error && <p className="discovery-status">{renderErrors[latest.error] || 'Chưa dựng được video.'}</p>}
        {latest.render_status === 'completed' && latest.render_id && <video className="studio-player" controls playsInline preload="none" src={`/api/studio/renders/${latest.render_id}/video`} poster={`/api/studio/renders/${latest.render_id}/poster`} aria-label="Video tự tạo mới nhất"/>}
      </div>}
      <aside className="studio-notice"><strong>Chưa đăng lên mạng xã hội</strong><p>Chưa kết nối tài khoản đích hoặc bộ đăng bài. Video đã dựng vẫn là bản riêng trong EmBe; không có bài nào được tự đăng.</p></aside>
      <details className="studio-disclosure"><summary>Lịch sử & phạm vi tự động</summary>
        <p>Dùng thư viện hữu hạn có nguồn đối chiếu, không phải AI tự nghiên cứu chủ đề mới. Hết chủ đề hoặc nguồn quá hạn thì dừng; không dùng hồ sơ, ảnh riêng của gia đình, không tự xác nhận duyệt chuyên môn.</p>
        {data.reviewDue && <p>Nguồn cần được rà soát lại chậm nhất ngày {new Date(`${data.reviewDue}T12:00:00+07:00`).toLocaleDateString('vi-VN')}.</p>}
        <p>Khi máy nhà tắt hoặc mất mạng, lịch chờ máy hoạt động lại; không dựng dồn các ngày đã lỡ.</p>
        <ul className="studio-ideas">{data.history.map(item => <li key={item.project_id}>{item.deleted ? <span>{item.title} — đã chuyển vào Đã xóa</span> : <Link href={`/studio/soan?du-an=${item.project_id}`}>{item.title}</Link>}<small>{localTime(item.created_at)} · {item.render_status ? renderLabels[item.render_status] : 'Đã tạo kịch bản'}</small></li>)}</ul>
      </details>
    </>}
  </section>;
}
