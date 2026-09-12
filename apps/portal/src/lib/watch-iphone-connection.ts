export type IphoneConnectionState = 'waiting'|'network-error'|'expired'|'paused';

/** Read-only, bounded check for this exact token, never another device's receipt. */
export function watchIphoneConnection(token:string, onState:(state:IphoneConnectionState)=>void, onReceived:()=>void) {
  let stopped=false, busy=false, lastAttempt=-Infinity;
  const deadline=Date.now()+120_000;
  let controller:AbortController|null=null;
  const finish=()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',check);window.removeEventListener('focus',check);controller?.abort();};
  const check=async()=>{
    if(stopped) return;
    if(Date.now()>=deadline){onState('paused');finish();return;}
    if(document.visibilityState!=='visible'||busy||Date.now()-lastAttempt<5000)return;
    busy=true;lastAttempt=Date.now();controller=new AbortController();
    const timeout=setTimeout(()=>controller?.abort(),10_000);
    try{
      const response=await fetch('/api/pregnancy/iphone-health',{cache:'no-store',headers:{authorization:`Bearer ${token}`},signal:controller.signal});
      if(stopped)return;
      if(response.status===401){onState('expired');finish();return;}
      if(!response.ok)throw new Error('receiver unavailable');
      const receipt=await response.json() as {connected?:boolean;lastSyncedAt?:string|null};
      if(stopped)return;
      if(receipt.connected!==true)throw new Error('invalid receipt');
      if(typeof receipt.lastSyncedAt==='string'&&Number.isFinite(Date.parse(receipt.lastSyncedAt))){finish();onReceived();return;}
      onState('waiting');
    }catch{if(!stopped)onState('network-error');}
    finally{clearTimeout(timeout);busy=false;}
  };
  const timer=setInterval(check,15_000);
  document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);
  void check();
  return finish;
}
