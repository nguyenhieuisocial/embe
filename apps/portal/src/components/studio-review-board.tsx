'use client';
import Link from 'next/link';
import { useCallback,useEffect,useRef,useState } from 'react';
import { documentScript,type StudioProject,type StudioRender } from '../lib/studio-project';
import { editorialChecks,studioChannels,type ReviewRequest,type ReviewEvent,type StudioChannel } from '../lib/studio-review';
import { SouthernVoiceSample } from './studio-voice-picker';
import StudioFileShare from './studio-file-share';

async function call(path:string,body?:unknown){
  const r=await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(18000),...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
  if(!r.ok)throw new Error(r.status===409?'Phiên bản đã thay đổi hoặc chưa dựng xong. Cập nhật và chọn lại bản mới.':r.status===401?'Cần đăng nhập lại EmBe. Ghi chú đang viết vẫn được giữ.':r.status===429?'Hàng chờ đã đầy. Không có nội dung nào bị xóa.':'Chưa lưu hoặc tải được. Kiểm tra kết nối rồi thử lại.');
  return r.json();
}
const eventLabels={requested:'Đưa vào hàng chờ',commented:'Ghi nhận góp ý',cancelled:'Rút khỏi hàng chờ',reopened:'Đưa lại vào hàng chờ'};
const date=(v:string)=>new Date(v).toLocaleString('vi-VN');
export default function StudioReviewBoard({initialProject}:{initialProject?:string}){
  const [projects,setProjects]=useState<StudioProject[]>([]),[requests,setRequests]=useState<ReviewRequest[]>([]),[selected,setSelected]=useState(initialProject||'');
  const [project,setProject]=useState<StudioProject|null>(null),[render,setRender]=useState<StudioRender|null>(null),[detail,setDetail]=useState<{request:ReviewRequest;events:ReviewEvent[]}|null>(null);
  const [target,setTarget]=useState<StudioChannel>('undecided'),[note,setNote]=useState(''),[comment,setComment]=useState(''),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('Đang mở hàng chờ…'),[cancelConfirm,setCancelConfirm]=useState(false);
  const flight=useRef(false),selection=useRef(0),autoOpened=useRef(false),polling=useRef(false);
  const refresh=useCallback(async()=>{const [a,b]=await Promise.all([call('/api/studio/workspace'),call('/api/studio/review')]);setProjects(a.projects.filter((p:StudioProject)=>!p.deleted));setRequests(b.requests);},[]);
  useEffect(()=>{void refresh().then(()=>setMessage('')).catch(e=>setMessage(e.message));},[refresh]);
  useEffect(()=>{
    const update=async()=>{if(flight.current||polling.current||!navigator.onLine||document.visibilityState==='hidden')return;polling.current=true;try{await refresh();}catch{/* Keep current list and written comments. */}finally{polling.current=false;}};
    const timer=setInterval(()=>void update(),15000);window.addEventListener('online',update);document.addEventListener('visibilitychange',update);
    return()=>{clearInterval(timer);window.removeEventListener('online',update);document.removeEventListener('visibilitychange',update);};
  },[refresh]);
  useEffect(()=>{
    const current=initialProject&&requests.find(q=>q.project_id===initialProject&&!q.stale&&q.status==='pending');
    if(current&&!detail&&!autoOpened.current){autoOpened.current=true;void open(current.id);}
  },[initialProject,requests,detail]);
  useEffect(()=>{const n=++selection.current;setProject(null);setRender(null);setAck(false);if(!selected)return;void call(`/api/studio/workspace?project=${selected}`).then(data=>{if(n!==selection.current)return;setProject(data.project);setRender(data.renders.find((r:StudioRender)=>r.revision===data.project.revision&&r.status==='completed')??null);}).catch(e=>{if(n===selection.current)setMessage(e.message);});},[selected]);
  async function open(id:string){try{const data=await call(`/api/studio/review?id=${id}`);setDetail(data);setComment('');setCancelConfirm(false);}catch(e){setMessage((e as Error).message);}}
  async function mutate(action:'request'|'comment'|'cancel'){
    if(flight.current)return;
    const entity=action==='request'?project:detail?.request;if(!entity)return;
    flight.current=true;setBusy(true);
    try{
      const data=await call('/api/studio/review',{action,id:entity.id,revision:entity.revision,note:action==='request'?note:action==='comment'?comment:'',...(action==='request'?{target,acknowledged:ack}:{})});
      if(action==='request'){setNote('');setAck(false);}else setComment('');
      await refresh();await open(data.id);
      setMessage(action==='request'?'Đã lưu vào hàng chờ trên EmBe. Chưa gửi cho bác sĩ, chưa đăng mạng xã hội.':action==='comment'?'Đã lưu góp ý. Đây chưa phải xác nhận chuyên môn.':'Đã rút yêu cầu. Lịch sử vẫn được giữ.');
    }catch(e){setMessage((e as Error).message);}finally{flight.current=false;setBusy(false);}
  }
  function exportReview(){
    if(!detail?.request.snapshot)return;
    const q=detail.request;const text=`Hồ sơ chờ duyệt EmBe\nPhiên bản ${q.project_revision}\n${q.stale?'Bản cũ — cần mở lại phiên bản mới.':'Chưa được người có chuyên môn xác nhận.'}\nNơi đăng dự kiến: ${studioChannels[q.target]}\n\n${documentScript(q.snapshot!)}\n\nLịch sử góp ý (tài khoản gia đình, chưa xác minh chuyên môn)\n${detail.events.map(e=>`${date(e.created_at)} · ${eventLabels[e.action]}\n${e.note}`).join('\n\n')}\n\nXem video sau khi đăng nhập EmBe: ${window.location.origin}/studio/duyet-dang`;
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`embe-ho-so-duyet-v${q.project_revision}.txt`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  const pending=requests.filter(q=>q.status==='pending'&&!q.stale);
  return <section aria-label="Quy trình duyệt và đăng">
    <ol className="studio-review-steps"><li><span>1</span>Giọng & video</li><li><span>2</span>Duyệt chuyên môn</li><li><span>3</span>Đăng bài</li></ol>
    <aside className="studio-notice"><strong>Chưa bật đăng tự động</strong><p>Cần người duyệt có chuyên môn được xác định và tài khoản đích được kết nối. AI, góp ý của gia đình và việc thêm nguồn không thay thế duyệt chuyên môn.</p></aside>
    <details className="studio-disclosure"><summary>Nghe giọng nữ miền Nam mới</summary><SouthernVoiceSample/><p>Thục Đoan và Mỹ Duyên: giọng AI kể chuyện, âm thanh 48 kHz. Chọn giọng trong màn hình soạn; lưu và dựng lại để áp dụng.</p><Link href="/studio/soan">Soạn video với giọng miền Nam</Link></details>
    <details className="studio-review-card studio-disclosure"><summary>Thêm hoặc điều chỉnh yêu cầu thủ công</summary>
      <p className="discovery-help">Video bật tự dựng đã được EmBe chuyển vào hàng chờ sau khi hoàn tất. Chỉ dùng phần này khi muốn đưa lại bản đã rút hoặc chọn nơi đăng riêng.</p>
      <label className="studio-search">Chọn bản nháp<select value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)}><option value="">Chọn nội dung đã lưu</option>{projects.map(p=><option key={p.id} value={p.id}>{p.payload.title}</option>)}</select></label>
      {project&&<><p className="discovery-help">Phiên bản {project.revision} · {render?'Đã có video đúng phiên bản':'Chưa có video đúng phiên bản'}</p><Link className="studio-back" href={`/studio/soan?du-an=${project.id}`}>{render?'Sửa nội dung hoặc giọng đọc':'Mở bản soạn để dựng video'} →</Link>
        <details className="studio-disclosure"><summary>Rà soát sơ bộ nội dung</summary><p>Đây là các điểm cần xem lại, không phải kết luận y khoa.</p>{editorialChecks(project.payload).length?<ul>{editorialChecks(project.payload).map(s=><li key={s}>{s}</li>)}</ul>:<p>Không phát hiện các cụm cảnh báo trong danh sách kiểm tra tự động. Nội dung vẫn cần người có chuyên môn đọc và đối chiếu nguồn.</p>}</details>
        {render&&<video className="studio-player" controls playsInline preload="none" src={`/api/studio/renders/${render.id}/video`} poster={`/api/studio/renders/${render.id}/poster`} aria-label="Video cần duyệt"/>}
        <fieldset className="studio-fields" disabled={busy}>
          <label className="studio-search">Nơi đăng dự kiến<select value={target} onChange={e=>setTarget(e.target.value as StudioChannel)}>{Object.entries(studioChannels).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
          <label className="studio-search">Điều cần người duyệt lưu ý<textarea rows={3} maxLength={1500} value={note} onChange={e=>setNote(e.target.value)} placeholder="Thuật ngữ, liều lượng, câu nào cần đối chiếu…"/></label>
          <label className="studio-review-check"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>Tôi đã xem video, nghe giọng và kiểm tra phụ đề của bản này.</label>
          <button className="discovery-button" disabled={!render||!ack} onClick={()=>void mutate('request')}>Lưu yêu cầu duyệt</button>
        </fieldset>
        <p className="discovery-help">Chỉ lưu hàng chờ nội bộ. Không tự gửi cho người ngoài hoặc lên lịch đăng.</p>
      </>}
    </details>
    <div className="studio-scene-heading"><h2>Hàng chờ ({pending.length})</h2><button className="discovery-button" disabled={busy} onClick={()=>void refresh().then(()=>{if(detail)void open(detail.request.id);setMessage('Đã cập nhật hàng chờ.');}).catch(e=>setMessage(e.message))}>Cập nhật</button></div>
    <p role="status" className="discovery-status">{message}</p>
    {!requests.length&&<p className="discovery-help">Chưa có yêu cầu. Lưu và dựng một bản video để bắt đầu.</p>}
    <ul className="studio-ideas">{requests.map(q=><li key={q.id}><button className="studio-review-open" disabled={busy} aria-expanded={detail?.request.id===q.id} onClick={()=>void open(q.id)}>{q.title}<small>v{q.project_revision} · {q.status==='cancelled'?'Đã rút':q.stale?'Nội dung đã thay đổi':'Chờ người có chuyên môn'} · {studioChannels[q.target]}</small></button></li>)}</ul>
    {detail&&<section className="studio-review-card" aria-label="Chi tiết yêu cầu duyệt"><h2>{detail.request.snapshot?.title}</h2><p className="discovery-help">Phiên bản {detail.request.project_revision} · tạo {date(detail.request.created_at)}</p>
      {detail.request.stale&&<aside className="studio-notice"><strong>Bản này đã cũ</strong><p>Kịch bản đã sửa hoặc xóa. Không sử dụng yêu cầu này để duyệt bản video mới.</p></aside>}
      <p className="discovery-help">{detail.request.origin==='automatic'?'EmBe tự chuyển bản dựng này vào hàng chờ. ':''}Chưa xác minh người duyệt chuyên môn. Các góp ý bên dưới chỉ là ghi chép của tài khoản gia đình.</p>
      <video className="studio-player" controls playsInline preload="none" src={`/api/studio/renders/${detail.request.render_id}/video`} poster={`/api/studio/renders/${detail.request.render_id}/poster`} aria-label="Video đúng bản yêu cầu duyệt"/>
      <div className="discovery-platforms"><button onClick={exportReview}>Tải hồ sơ duyệt</button><Link href={`/studio/soan?du-an=${detail.request.project_id}`}>Mở bản soạn</Link></div>
      <details className="studio-disclosure"><summary>Xem kịch bản & nguồn đúng phiên bản</summary>{detail.request.snapshot?.scenes.map((s,i)=><div key={i}><h3>{s.heading}</h3><p>{s.text}</p>{s.speechText&&<p>Lời đọc riêng: {s.speechText}</p>}</div>)}{detail.request.snapshot?.sources.map(s=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a>)}</details>
      <ul className="studio-review-history">{detail.events.map(e=><li key={e.id}><small>{date(e.created_at)} · {eventLabels[e.action]}</small>{e.note&&<p>{e.note}</p>}</li>)}</ul>
      {detail.request.status==='pending'&&<><label className="studio-search">Ghi nhận góp ý<textarea rows={3} maxLength={1500} value={comment} disabled={busy} onChange={e=>setComment(e.target.value)}/></label><div className="discovery-platforms"><button disabled={busy||!comment.trim()} onClick={()=>void mutate('comment')}>Lưu góp ý</button><button disabled={busy} onClick={()=>setCancelConfirm(true)}>Rút yêu cầu</button></div>{cancelConfirm&&<div><p>Rút bản này khỏi hàng chờ? Góp ý và lịch sử vẫn được giữ.</p><button className="discovery-button" disabled={busy} onClick={()=>void mutate('cancel')}>Xác nhận rút</button><button className="discovery-button" onClick={()=>setCancelConfirm(false)}>Giữ yêu cầu</button></div>}</>}
      <details className="studio-disclosure"><summary>Tải hoặc chuyển file trên iPhone</summary><p>Chỉ dùng khi đã hoàn tất việc duyệt ở ngoài EmBe. Chia sẻ file không có nghĩa bài đã được đăng.</p><StudioFileShare url={`/api/studio/renders/${detail.request.render_id}/video`} title={detail.request.snapshot?.title||'EmBe'} filename={`embe-v${detail.request.project_revision}.mp4`}/></details>
    </section>}
    <section className="studio-review-card" aria-label="Kết nối đăng bài"><h2>Tài khoản đăng bài</h2><p className="discovery-help">Chưa có tài khoản nào được kết nối bằng quyền đăng chính thức. Đăng nhập mạng xã hội trong một tab khác không tự cấp quyền cho EmBe.</p><ul className="studio-channel-list">{Object.entries(studioChannels).filter(([id])=>id!=='undecided').map(([id,label])=><li key={id}><span>{label}</span><small>Chưa kết nối</small></li>)}</ul><p className="discovery-help">Chưa có lịch tự đăng. Gắn sản phẩm và xác nhận bài đăng hiện thực hiện trong ứng dụng đích.</p></section>
  </section>;
}
