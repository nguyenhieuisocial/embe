'use client';
import { useEffect, useRef, useState } from 'react';
export default function StudioFileShare({url,title,filename}:{url:string;title:string;filename:string}) {
  const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');const lock=useRef(false),controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function prepare(){if(lock.current)return;lock.current=true;setBusy(true);controller.current=new AbortController();const timeout=setTimeout(()=>controller.current?.abort(),30000);
    try{const r=await fetch(url,{cache:'no-store',signal:controller.current.signal});if(!r.ok||!r.headers.get('content-type')?.startsWith('video/mp4'))throw new Error();const reader=r.body?.getReader();if(!reader)throw new Error();const chunks:Uint8Array<ArrayBuffer>[]=[];let size=0;try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>4000000){await reader.cancel();throw new Error();}chunks.push(new Uint8Array(p.value));}}finally{reader.releaseLock();}if(!size)throw new Error();setFile(new File(chunks,filename,{type:'video/mp4'}));setMessage('File sẵn sàng. Nhấn Chia sẻ để chọn ứng dụng hoặc Lưu video.');}
    catch{setMessage('Chưa chuẩn bị được file. Thử lại hoặc dùng Tải video.');}finally{clearTimeout(timeout);setBusy(false);lock.current=false;}
  }
  async function share(){if(!file||lock.current)return;lock.current=true;
    try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title});setMessage('Đã chuyển file sang bảng chia sẻ; chưa xác nhận bài đã được đăng.');}
      else{setMessage('Trình duyệt này chưa chia sẻ file trực tiếp. Chọn Tải video rồi mở ứng dụng muốn đăng.');}}
    catch(e){setMessage((e as Error).name==='AbortError'?'Đã đóng bảng chia sẻ. File vẫn sẵn sàng.':'Chưa chia sẻ được; bạn có thể tải video.');}finally{lock.current=false;}
  }
  return <div className="studio-file-share"><div className="studio-action-grid"><button disabled={busy} onClick={()=>void(file?share():prepare())}>{busy?'Đang chuẩn bị…':file?'Chia sẻ file video':'Chuẩn bị chia sẻ'}</button><a href={`${url}?download=1`} download={filename}>Tải video</a></div><p role="status" className="discovery-help">{message||'Chia sẻ file thật sang ứng dụng trên iPhone, không gửi link riêng cần đăng nhập.'}</p></div>;
}
