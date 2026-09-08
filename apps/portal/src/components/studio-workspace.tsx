'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { documentScript, readyToRender, renderErrors, renderLabels, studioDocument, templateDocument, type StudioDocument, type StudioProject, type StudioRender } from '../lib/studio-project';
import type { StudioTopic } from '../lib/studio-types';
import StudioFileShare from './studio-file-share';
import StudioVoicePicker from './studio-voice-picker';
import { studioSocialCaption } from '../lib/studio-subtitles';
import { useFamilyDataRefresh } from '../lib/use-family-data-refresh';

async function api(query='',body?:unknown) {
  const response=await fetch(`/api/studio/workspace${query}`,{method:body?'POST':'GET',cache:'no-store',signal:AbortSignal.timeout(18000),...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw new Error(response.status===401?'Hãy đăng nhập lại EmBe; nội dung đang nhập vẫn giữ.':response.status===409?'Bản này đã thay đổi ở thiết bị khác. Giữ bản đang viết, tải bản mới hoặc lưu thành bản riêng.':response.status===429?'Hàng đợi hoặc kho nháp đã đầy. Đợi bản đang dựng hoàn tất.':data.error==='scenes_and_sources_required'?'Điền đủ nội dung từng cảnh và ít nhất một nguồn đối chiếu.':'Chưa kết nối được Studio. Nội dung đang nhập vẫn giữ; thử lại khi có mạng.');
  return data;
}
function download(name:string,text:string,type='text/plain;charset=utf-8') { const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500); }
function workerText(at:string|null) { return at&&Date.now()-Date.parse(at)<120000?'Máy dựng đang kết nối.':'Máy dựng chưa kết nối gần đây. Bản nháp vẫn lưu; yêu cầu sẽ chờ máy nhà hoạt động.'; }

export default function StudioWorkspace({templates}:{templates:StudioTopic[]}) {
  const [projects,setProjects]=useState<StudioProject[]>([]),[message,setMessage]=useState('Đang mở bàn làm việc…'),[seen,setSeen]=useState<string|null>(null),[trash,setTrash]=useState(false),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{try{const data=await api();setProjects(data.projects);setSeen(data.workerSeenAt);setLoaded(true);setMessage('');}catch(e){setMessage((e as Error).message);}},[]);
  useFamilyDataRefresh(async canApply => { const data=await api(); if(canApply()){setProjects(data.projects);setSeen(data.workerSeenAt);} }, loaded && !busy);
  useEffect(()=>{void refresh();const focus=()=>{void refresh();};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[refresh]);
  async function restore(p:StudioProject){if(busy)return;setBusy(true);try{await api('',{action:'restore',id:p.id,revision:p.revision});await refresh();setMessage('Đã khôi phục bản nháp.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  return <section aria-label="Bàn làm việc Studio">
    <div className="studio-action-grid"><Link href="/studio/soan">Viết nội dung mới</Link><Link href="/studio/kham-pha">Tìm ý tưởng</Link></div>
    <p className="discovery-help">Bản nháp lưu riêng trên EmBe, dùng chung giữa các điện thoại đã đăng nhập. Không lấy nhật ký hay hồ sơ sức khỏe.</p>
    <p className="discovery-help">{workerText(seen)}</p>
    <Link className="studio-back" href="/studio/duyet-dang">Mở hàng chờ duyệt & trạng thái đăng →</Link>
    <details className="studio-disclosure"><summary>Bắt đầu từ kịch bản có sẵn</summary><ul className="studio-ideas">{templates.map(t=><li key={t.slug}><Link className="studio-back" href={`/studio/soan?mau=${t.slug}`}>{t.title}</Link></li>)}</ul></details>
    <div className="discovery-platforms"><button aria-pressed={!trash} onClick={()=>setTrash(false)}>Đang làm ({projects.filter(p=>!p.deleted).length})</button><button aria-pressed={trash} onClick={()=>setTrash(true)}>Đã xóa ({projects.filter(p=>p.deleted).length})</button><button onClick={()=>void refresh()}>Cập nhật danh sách</button></div>
    <p role="status" className="discovery-status">{message}</p>
    {loaded&&!projects.some(p=>p.deleted===trash)&&<p className="studio-empty">{trash?'Chưa có bản đã xóa.':'Chưa có bản riêng. Chọn một kịch bản có sẵn hoặc viết ý tưởng đầu tiên.'}</p>}
    <ul className="studio-ideas">{projects.filter(p=>p.deleted===trash).map(p=><li key={p.id}><Link className="studio-back" href={`/studio/soan?du-an=${p.id}`}>{p.payload.title}</Link><p className="discovery-help">{p.payload.scenes.length} cảnh · sửa {new Date(p.updated_at).toLocaleString('vi-VN')}</p>{trash&&<button className="discovery-button" disabled={busy} onClick={()=>void restore(p)}>Khôi phục</button>}</li>)}</ul>
    <button className="discovery-button" disabled={!loaded} onClick={()=>download('embe-studio-ban-nhap.json',JSON.stringify({version:1,projects},null,2),'application/json')}>Xuất bản sao kịch bản</button>
    <details className="studio-disclosure"><summary>Đăng lên mạng xã hội</summary><p>Tải video hoặc nhấn Chia sẻ file để gửi sang ứng dụng trên điện thoại. Bạn chọn nơi đăng và gắn sản phẩm trong ứng dụng đích.</p><p>TikTok, Instagram, Facebook, YouTube và Zalo Video chưa được kết nối để tự đăng. EmBe không tự chọn tài khoản hay giả báo đăng thành công.</p></details>
  </section>;
}

export function StudioEditor({projectId,template,ideaId}:{projectId?:string;template?:StudioTopic;ideaId?:string}) {
  const [id,setId]=useState(projectId||''),[doc,setDoc]=useState<StudioDocument>(()=>templateDocument(template)),[saved,setSaved]=useState<StudioProject|null>(null),[renders,setRenders]=useState<StudioRender[]>([]);
  const [loaded,setLoaded]=useState(!projectId),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[seen,setSeen]=useState<string|null>(null),[deleteConfirm,setDeleteConfirm]=useState(false),[recovery,setRecovery]=useState<StudioDocument|null>(null);
  const [saving,setSaving]=useState(false),[autoError,setAutoError]=useState<'network'|'conflict'|'invalid'|null>(null),[retries,setRetries]=useState(0);
  const editVersion=useRef(0),saveAutomatically=useRef(()=>{}),currentDocument=useRef(doc);
  currentDocument.current=doc;
  const inFlight=useRef(false),cacheKey=`embe:studio-editor:${projectId||'new'}`;
  const dirty=!saved||JSON.stringify(doc)!==JSON.stringify(saved.payload);
  const latest=renders.find(r=>r.revision===saved?.revision);
  const active=renders.find(r=>['queued','rendering'].includes(r.status));
  const completed=renders.find(r=>r.status==='completed');
  useFamilyDataRefresh(async canApply => {
    const data=await api(`?project=${id}`);
    if(!canApply())return;
    setRenders(data.renders);setSeen(data.workerSeenAt);
    if(data.project.revision!==saved?.revision){setSaved(data.project);setDoc(data.project.payload);setMessage('Đã đồng bộ bản mới từ thiết bị khác.');}
  }, loaded && !!saved && !dirty && !busy && !saving && !recovery);
  const fetchProject=useCallback(async()=>{
    const data=await api(`?project=${projectId}`);setSaved(data.project);setDoc(data.project.payload);setRenders(data.renders);setSeen(data.workerSeenAt);setLoaded(true);return data;
  },[projectId]);
  useEffect(()=>{
    if(!id)setId(crypto.randomUUID());
    if(template&&!projectId&&!ideaId)editVersion.current=1;
    if(projectId)void fetchProject().catch(e=>setMessage(e.message));
    if(ideaId)void api('?board=1').then(data=>{const item=data.items.find((i:{id:string})=>i.id===ideaId);if(item)setDoc({...templateDocument(),title:item.title.slice(0,120),caption:`${item.note}\n\nNguồn cảm hứng (không phải nguồn y khoa): ${item.url}`});}).catch(e=>setMessage(e.message));
    try{const value=sessionStorage.getItem(cacheKey);if(value)setRecovery(studioDocument(JSON.parse(value)));}catch{/* Keep a damaged cache intact; never overwrite cloud. */}
  // Initial load only; status polling below never overwrites the editor.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[projectId,ideaId,fetchProject,cacheKey]);
  useEffect(()=>{if(!dirty)return;const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);},[dirty]);
  function edit(next:StudioDocument){next={...next,autoRender:next.autoRender??true};editVersion.current++;setDoc(next);if(autoError!=='conflict')setAutoError(null);setRetries(0);try{sessionStorage.setItem(saved?`embe:studio-editor:${id}`:cacheKey,JSON.stringify(next));}catch{setMessage('Trình duyệt không giữ được bản tạm. Hãy lưu lên EmBe trước khi rời trang.');}}
  const refreshStatus=useCallback(async()=>{if(!id||!saved)return;try{const data=await api(`?project=${id}`);setRenders(data.renders);setSeen(data.workerSeenAt);if(data.project.revision!==saved.revision)setMessage('Bản trên máy chủ đã thay đổi. Nội dung bạn đang viết vẫn giữ; lưu bản riêng hoặc mở lại bản trên máy chủ.');}catch(e){setMessage((e as Error).message);}},[id,saved]);
  useEffect(()=>{if(!active&&!(saved?.payload.autoRender&&readyToRender(saved.payload)&&(!latest||(latest.status==='failed'&&latest.attempts<3&&['interrupted','storage_unavailable','worker_unavailable'].includes(latest.error??'')))))return;const timer=setInterval(()=>{if(document.visibilityState==='visible')void refreshStatus();},8000);return()=>clearInterval(timer);},[active,latest,saved,refreshStatus]);
  useEffect(()=>{const focus=()=>{void refreshStatus();};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[refreshStatus]);
  async function save(copy=false,automatic=false):Promise<StudioProject|null>{
    if(inFlight.current)return null;inFlight.current=true;setSaving(true);if(!automatic)setBusy(true);
    const version=editVersion.current;
    try{const payload=studioDocument({...doc,autoRender:doc.autoRender??true});const target=copy?crypto.randomUUID():id;const data=await api('',{action:'save',id:target,revision:copy?0:saved?.revision??0,payload});setSaved(data.project);setId(target);setAutoError(null);setRetries(0);
      if(version===editVersion.current){setDoc(data.project.payload);try{sessionStorage.removeItem(cacheKey);sessionStorage.removeItem(`embe:studio-editor:${id}`);}catch{}setRecovery(null);}
      else{try{sessionStorage.setItem(`embe:studio-editor:${target}`,JSON.stringify(currentDocument.current));if(cacheKey!==`embe:studio-editor:${target}`)sessionStorage.removeItem(cacheKey);}catch{}}
      setMessage(payload.autoRender&&readyToRender(payload)?'Đã lưu. EmBe sẽ tự dựng sau khi bạn ngừng sửa khoảng 30 giây; có thể rời trang.':'Đã lưu trên EmBe.');window.history.replaceState(null,'',`/studio/soan?du-an=${target}`);return data.project;}
    catch(e){const reason=(e as Error).message;setAutoError(reason==='invalid_request'?'invalid':reason.includes('thiết bị khác')?'conflict':'network');setMessage(reason==='invalid_request'?'Kiểm tra độ dài kịch bản: tối đa 6 cảnh, 900 ký tự nội dung, 1.100 ký tự lời đọc riêng; nguồn cần liên kết HTTPS.':reason);return null;}
    finally{inFlight.current=false;setSaving(false);if(!automatic)setBusy(false);}
  }
  saveAutomatically.current=()=>{void save(false,true);};
  useEffect(()=>{
    if(!loaded||!id||!dirty||busy||saving||recovery||saved?.deleted||!editVersion.current||autoError)return;
    const timer=setTimeout(()=>saveAutomatically.current(),1800);return()=>clearTimeout(timer);
  },[loaded,id,dirty,busy,saving,recovery,saved,doc,autoError]);
  useEffect(()=>{
    if(autoError!=='network')return;
    const resume=()=>{setRetries(0);setAutoError(null);};window.addEventListener('online',resume);
    const timer=retries<3?setTimeout(()=>{setRetries(n=>n+1);setAutoError(null);},30000):null;
    return()=>{window.removeEventListener('online',resume);if(timer)clearTimeout(timer);};
  },[autoError,retries]);
  async function action(kind:'render'|'cancel'|'delete'){
    if(inFlight.current||!saved)return;inFlight.current=true;setBusy(true);
    try{const data=await api('',{action:kind,id,revision:kind==='cancel'?active?.revision:saved.revision});
      if(kind==='delete'){setSaved(data.project);setDeleteConfirm(false);setMessage('Đã chuyển vào mục Đã xóa. Có thể khôi phục ở Bàn làm việc.');}
      else{await refreshStatus();setMessage(kind==='render'?'Đã gửi yêu cầu dựng. Bạn có thể rời trang rồi quay lại xem kết quả.':'Đã hủy yêu cầu dựng.');}}
    catch(e){setMessage((e as Error).message);}finally{inFlight.current=false;setBusy(false);}
  }
  if(!loaded)return <section><p role="status">{message||'Đang mở bản nháp…'}</p><button className="discovery-button" onClick={()=>void fetchProject().catch(e=>setMessage(e.message))}>Thử mở lại</button></section>;
  if(saved?.deleted)return <section><p role="status">Bản này đã xóa, chưa bị xóa vĩnh viễn.</p><Link className="studio-back" href="/studio/ban-lam-viec">Mở mục Đã xóa để khôi phục</Link></section>;
  return <section aria-label="Soạn nội dung Studio">
    {recovery&&<aside className="studio-notice"><p>Có bản viết dở trên trình duyệt này.</p><button className="discovery-button" onClick={()=>{edit(recovery);setRecovery(null);}}>Khôi phục vào ô soạn</button><button className="discovery-button" onClick={()=>{sessionStorage.removeItem(cacheKey);setRecovery(null);}}>Bỏ bản tạm</button></aside>}
    <fieldset className="studio-fields" disabled={busy}>
    <label className="studio-search">Tên nội dung<input value={doc.title} maxLength={120} onChange={e=>edit({...doc,title:e.target.value})}/></label>
    <label className="studio-search">Dành cho giai đoạn<input value={doc.stage} maxLength={80} placeholder="Mới mang thai, sau sinh…" onChange={e=>edit({...doc,stage:e.target.value})}/></label>
    <StudioVoicePicker value={doc.voice} onChange={voice=>edit({...doc,voice})}/>
    <p className="discovery-help">Nội dung tự lưu khi bạn ngừng nhập. {doc.autoRender!==false?'Đủ cảnh và nguồn thì EmBe tự dựng video, không cần chọn giọng hoặc bấm dựng.':'Tự dựng đang tạm dừng; nội dung vẫn tự lưu.'}</p>
    <p className="discovery-help">Tự thêm phụ đề Việt hai dòng, tên nguồn và chú thích đăng bài. Phụ đề giữ trong video khi chia sẻ. Tối đa 6 cảnh / 90 giây; không đưa hồ sơ riêng vào đây.</p>
    <ol className="studio-edit-scenes">{doc.scenes.map((scene,index)=><li key={index}>
      <div className="studio-scene-heading"><h2>Cảnh {index+1}</h2><div className="discovery-platforms"><button disabled={index===0} aria-label={`Đưa cảnh ${index+1} lên`} onClick={()=>{const scenes=[...doc.scenes];[scenes[index-1],scenes[index]]=[scenes[index],scenes[index-1]];edit({...doc,scenes});}}>↑</button><button disabled={index===doc.scenes.length-1} aria-label={`Đưa cảnh ${index+1} xuống`} onClick={()=>{const scenes=[...doc.scenes];[scenes[index+1],scenes[index]]=[scenes[index],scenes[index+1]];edit({...doc,scenes});}}>↓</button><button disabled={doc.scenes.length===1} onClick={()=>edit({...doc,scenes:doc.scenes.filter((_,i)=>i!==index)})}>Bỏ cảnh {index+1}</button></div></div>
      <label className="studio-search">Tiêu đề cảnh {index+1}<input maxLength={80} value={scene.heading} onChange={e=>edit({...doc,scenes:doc.scenes.map((s,i)=>i===index?{...s,heading:e.target.value}:s)})}/></label>
      <label className="studio-search">Lời đọc cảnh {index+1}<textarea rows={3} maxLength={180} value={scene.text} onChange={e=>edit({...doc,scenes:doc.scenes.map((s,i)=>i===index?{...s,text:e.target.value}:s)})}/></label>
      <details className="studio-disclosure"><summary>Chỉnh phát âm{scene.speechText?' · đã tùy chỉnh':''}</summary>
        <p className="discovery-help">Không bắt buộc: EmBe đã tự xử lý cách đọc. Chỉ dùng nếu bạn muốn cách đọc riêng; chữ trên video giữ nguyên.</p>
        <label className="studio-search">Lời đọc riêng cảnh {index+1}<textarea rows={3} maxLength={240} value={scene.speechText??''} placeholder={scene.text} onChange={e=>edit({...doc,scenes:doc.scenes.map((s,i)=>i===index?{...s,speechText:e.target.value}:s)})}/></label>
        <p className="discovery-help">Để trống để đọc theo nội dung cảnh. Tối đa 240 ký tự/cảnh, 1.100 ký tự lời đọc cả video.</p>
      </details>
    </li>)}</ol>
    <button className="discovery-button" disabled={doc.scenes.length===6} onClick={()=>edit({...doc,scenes:[...doc.scenes,{heading:'',text:''}]})}>Thêm cảnh</button>
    <p className="discovery-help">{doc.scenes.reduce((n,s)=>n+s.text.length,0)}/900 ký tự lời đọc</p>
    <details className="studio-disclosure"><summary>Caption & nguồn đối chiếu ({doc.sources.length})</summary>
      <label className="studio-search">Caption khi đăng<textarea rows={4} maxLength={1500} value={doc.caption} placeholder="Không bắt buộc — EmBe tự tạo từ tiêu đề, giai đoạn và nguồn đã lưu." onChange={e=>edit({...doc,caption:e.target.value})}/></label>
      <p>Nguồn để bạn đọc và đối chiếu; EmBe không tự xác nhận nội dung đúng y khoa.</p>
      {doc.sources.map((s,i)=><div key={i}><label className="studio-search">Tên nguồn {i+1}<input maxLength={100} value={s.title} onChange={e=>edit({...doc,sources:doc.sources.map((x,j)=>j===i?{...x,title:e.target.value}:x)})}/></label><label className="studio-search">Link nguồn {i+1}<input type="url" maxLength={700} value={s.url} onChange={e=>edit({...doc,sources:doc.sources.map((x,j)=>j===i?{...x,url:e.target.value}:x)})}/></label><button className="discovery-button" onClick={()=>edit({...doc,sources:doc.sources.filter((_,j)=>j!==i)})}>Bỏ nguồn {i+1}</button></div>)}
      <button className="discovery-button" disabled={doc.sources.length===6} onClick={()=>edit({...doc,sources:[...doc.sources,{title:'',url:''}]})}>Thêm nguồn</button>
    </details>
    </fieldset>
    <div className="studio-editor-save"><button className="discovery-button" disabled={busy||saving||!dirty} onClick={()=>void save()}>{saving?'Đang tự lưu…':busy?'Đang xử lý…':dirty?'Lưu bản nháp':'Đã lưu'}</button><button className="discovery-button" disabled={busy||saving} onClick={()=>void save(true)}>Lưu thành bản riêng</button></div>
    <p role="status" className="discovery-status">{message}</p>
    {saved&&<section className="studio-render-panel" aria-label="Dựng video">
      <h2>Dựng & chia sẻ</h2><p className="discovery-help">{workerText(seen)}</p>
      <Link className="studio-back" href={`/studio/duyet-dang?du-an=${id}`}>Chuẩn bị duyệt chuyên môn & đăng →</Link>
      <p className="discovery-help">Video là bản nháp riêng, chưa duyệt chuyên môn và không tự đăng mạng xã hội.</p>
      <label className="studio-review-check"><input type="checkbox" checked={doc.autoRender!==false} onChange={e=>edit({...doc,autoRender:e.target.checked})}/>Tự dựng khi nội dung đã lưu đầy đủ</label>
      {dirty&&<p className="discovery-help">{saving?'Đang tự lưu nội dung mới…':'Đang giữ thay đổi; chỉ bản đã lưu mới được dựng.'}</p>}
      <div className="discovery-platforms">{(!doc.autoRender||latest?.status==='failed'||latest?.status==='cancelled')&&<button disabled={busy||saving||dirty||!readyToRender(doc)||!!active||latest?.status==='completed'} onClick={()=>void action('render')}>{latest?.status==='failed'||latest?.status==='cancelled'?'Thử dựng lại':'Dựng video có giọng Việt'}</button>}{active&&<button disabled={busy} onClick={()=>void action('cancel')}>Hủy yêu cầu</button>}<button onClick={()=>void refreshStatus()}>Cập nhật tiến độ</button></div>
      {!readyToRender(doc)&&<p className="discovery-help">Cần điền đủ từng cảnh và thêm nguồn trong “Caption & nguồn đối chiếu”.</p>}
      {renders.map(r=><article className="studio-render-result" key={r.id}><p><strong>{renderLabels[r.status]}</strong> · phiên bản {r.revision}{r.status==='rendering'?` · ${r.progress}%`:''}</p>{r.error&&<p role="alert">{renderErrors[r.error]||'Chưa dựng được. Hãy thử lại sau.'}</p>}
        {r.status==='completed'&&<><p className="discovery-help">{r.output?.duration?.toFixed(1)} giây · có giọng đọc AI{r.output?.captions?.burnedIn?' · phụ đề tự động':''}{r.revision!==saved.revision?' · bản cũ, chưa gồm thay đổi mới':''}</p><video className="studio-player" controls playsInline preload="metadata" poster={`/api/studio/renders/${r.id}/poster`} src={`/api/studio/renders/${r.id}/video`} aria-label={`Video phiên bản ${r.revision}`}/><StudioFileShare url={`/api/studio/renders/${r.id}/video`} title={doc.title} filename={`embe-${r.id}.mp4`}/><div className="discovery-platforms"><a href={`/api/studio/renders/${r.id}/script`}>Kịch bản đúng bản video</a><a href={`/api/studio/renders/${r.id}/subtitles`}>Tải phụ đề VTT</a><a href={`/api/studio/renders/${r.id}/subtitles?format=srt`}>Tải phụ đề SRT</a><a href={`/api/studio/renders/${r.id}/caption`}>Chú thích đăng bài</a></div></>}
      </article>)}
      {completed?.output?.voiceCredit&&<details className="studio-disclosure"><summary>Giọng đọc & quyền sử dụng</summary><p>{completed.output.voiceCredit.attribution}</p><a href={completed.output.voiceCredit.license} target="_blank" rel="noreferrer">Giấy phép giọng đọc</a></details>}
    </section>}
    <details className="studio-disclosure"><summary>Xuất nội dung & quản lý bản nháp</summary><button className="discovery-button" onClick={()=>download('embe-kich-ban.txt',documentScript(doc))}>Tải kịch bản đang soạn</button><button className="discovery-button" onClick={()=>download('embe-caption.txt',studioSocialCaption(doc))}>Tải caption</button>{saved&&<><Link className="studio-back" href={`/studio/soan?du-an=${id}`}>Đường dẫn bản đã lưu</Link><button className="discovery-button" onClick={()=>setDeleteConfirm(true)}>Xóa bản nháp</button>{deleteConfirm&&<div><p>Chuyển bản này vào mục Đã xóa và hủy yêu cầu dựng đang chờ?</p><button className="discovery-button" disabled={busy} onClick={()=>void action('delete')}>Xác nhận xóa</button><button className="discovery-button" onClick={()=>setDeleteConfirm(false)}>Giữ lại</button></div>}</>}</details>
  </section>;
}
