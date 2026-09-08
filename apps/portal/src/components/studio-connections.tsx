'use client';
import {useEffect,useRef,useState} from 'react';
import type {StudioConnections} from '../lib/studio-connections-server';

const messages:Record<StudioConnections['status'],string>={
  not_configured:'Chưa cấu hình Postiz. Cần tài khoản Postiz và khóa API lưu riêng trên máy chủ; không gửi mật khẩu mạng xã hội vào EmBe.',
  authorization_required:'Postiz chưa chấp nhận khóa kết nối. Cần kiểm tra lại quyền hoặc thay khóa trên máy chủ.',
  unavailable:'Chưa kiểm tra được kết nối. Thử lại sau; không có bài nào được gửi.',
  available:'Đã đọc danh sách tài khoản từ Postiz. Đây chưa phải xác nhận đăng bài thành công.',
};
export default function StudioConnectionsPanel(){
  const [result,setResult]=useState<StudioConnections|null>(null),[busy,setBusy]=useState(false);
  const [sessionExpired,setSessionExpired]=useState(false);
  const pending=useRef<AbortController|null>(null);
  const checked=useRef(false);
  const [connectMessage,setConnectMessage]=useState('');
  useEffect(()=>()=>{pending.current?.abort();pending.current=null;},[]);
  async function check(){
    if(pending.current)return;
    const controller=new AbortController();pending.current=controller;
    checked.current=true;setBusy(true);setResult(null);setSessionExpired(false);
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch('/api/studio/connections',{cache:'no-store',signal:controller.signal});
      if(response.status===401){setSessionExpired(true);return;}
      if(!response.ok)throw new Error('unavailable');
      setResult(await response.json());
    }catch{if(pending.current===controller)setResult({status:'unavailable',accounts:[]});}
    finally{clearTimeout(timer);if(pending.current===controller){pending.current=null;setBusy(false);}}
  }
  async function connect(provider:string){
    if(pending.current)return;
    const controller=new AbortController();pending.current=controller;setBusy(true);setConnectMessage('Đang mở trang cấp quyền…');
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch('/api/studio/connections',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider}),signal:controller.signal});
      if(response.status===401){setSessionExpired(true);setConnectMessage('Đăng nhập lại EmBe để kết nối.');return;}
      const data=await response.json();
      if(response.ok&&data.status==='available'&&typeof data.url==='string'){
        window.location.assign(data.url);return;
      }
      setConnectMessage(data.status in messages?messages[data.status as keyof typeof messages]:'Chưa mở được kết nối. Vui lòng thử lại.');
    }catch{if(pending.current===controller)setConnectMessage('Chưa mở được kết nối. Vui lòng thử lại.');}
    finally{clearTimeout(timer);if(pending.current===controller){pending.current=null;setBusy(false);}}
  }
  return <details className="studio-disclosure" onToggle={e=>{if(e.currentTarget.open&&!checked.current)void check();}}>
    <summary>Tài khoản mạng xã hội</summary>
    <p>Chọn kênh rồi đăng nhập và cấp quyền. Kết nối không tự đăng bài hoặc gắn giỏ hàng.</p>
    <div className="studio-ideas">{[['tiktok','TikTok'],['instagram-standalone','Instagram'],['facebook','Facebook'],['youtube','YouTube']].map(([provider,label])=><button key={provider} type="button" className="discovery-button" disabled={busy} onClick={()=>void connect(provider)}>Kết nối {label}</button>)}</div>
    {connectMessage?<p role="status">{connectMessage}</p>:null}
    <p>Zalo Video chưa hỗ trợ trong kết nối này.</p>
    <button className="discovery-button" disabled={busy} onClick={()=>void check()}>{busy?'Đang kiểm tra…':'Kiểm tra kết nối'}</button>
    <p role="status" aria-busy={busy}>{busy?'Đang kiểm tra tài khoản đã kết nối…':sessionExpired?'Phiên EmBe đã hết hạn. Đăng nhập lại rồi kiểm tra kết nối.':result?messages[result.status]:''}</p>
    {result?.status==='available'&&<ul className="studio-ideas">{result.accounts.length?result.accounts.map((a,i)=><li key={i} style={{overflowWrap:'anywhere'}}>{a.name} · {a.provider}<p>{a.disabled?'Đang tắt':'Đã được liệt kê · chưa kiểm chứng quyền đăng'}</p></li>):<li>Chưa có tài khoản nào được kết nối trong Postiz.</li>}</ul>}
    <a className="studio-back" href="https://docs.postiz.com/public-api/introduction" target="_blank" rel="noopener noreferrer">Hướng dẫn cấu hình Postiz</a>
    <a className="studio-back" href="https://platform.postiz.com" target="_blank" rel="noopener noreferrer">Mở Postiz để quản lý tài khoản</a>
  </details>;
}
