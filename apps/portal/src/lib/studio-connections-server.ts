// Postiz public API: https://docs.postiz.com/public-api/integrations/list
// Read-only inventory. A listed account is NOT proof of permission to publish.
export type StudioConnection = {name:string;provider:string;disabled:boolean};
export type StudioConnections = {status:'not_configured'|'available'|'authorization_required'|'unavailable';accounts:StudioConnection[]};
const oauthHosts:Record<string,string[]>={
  tiktok:['www.tiktok.com','tiktok.com'],
  youtube:['accounts.google.com'],
  facebook:['www.facebook.com','facebook.com'],
  'instagram-standalone':['www.instagram.com','api.instagram.com','instagram.com'],
};
/** Postiz manages OAuth state/callbacks. Never return its API key to the browser. */
export async function studioConnect(provider:unknown):Promise<{status:StudioConnections['status']|'unsupported';url?:string}>{
  if(typeof provider!=='string'||!Object.hasOwn(oauthHosts,provider))return {status:'unsupported'};
  const key=process.env.EMBE_POSTIZ_API_KEY?.trim();
  if(!key)return {status:'not_configured'};
  try{
    const response=await fetch(`https://api.postiz.com/public/v1/social/${provider}`,{
      headers:{Authorization:key},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000),
    });
    if([401,403].includes(response.status))return {status:'authorization_required'};
    if(!response.ok)throw new Error('unavailable');
    const data:unknown=await response.json();
    if(!data||typeof data!=='object'||!('url' in data)||typeof data.url!=='string')throw new Error('invalid_response');
    const url=new URL(data.url);
    if(url.protocol!=='https:'||url.username||url.password||url.port||!oauthHosts[provider].includes(url.hostname))throw new Error('invalid_destination');
    return {status:'available',url:url.href};
  }catch{return {status:'unavailable'};}
}
export async function studioConnections():Promise<StudioConnections> {
  const key=process.env.EMBE_POSTIZ_API_KEY?.trim();
  if(!key)return {status:'not_configured',accounts:[]};
  try {
    // Fixed destination; no caller-provided URLs, redirects or browser-side key.
    const response=await fetch('https://api.postiz.com/public/v1/integrations',{
      headers:{Authorization:key},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000),
    });
    if([401,403].includes(response.status))return {status:'authorization_required',accounts:[]};
    if(!response.ok)throw new Error('unavailable');
    const data:unknown=await response.json();
    if(!Array.isArray(data)||data.length>100)throw new Error('invalid_response');
    const accounts=data.map((entry:unknown):StudioConnection=>{
      if(!entry||typeof entry!=='object')throw new Error('invalid_response');
      const row=entry as Record<string,unknown>;
      if(typeof row.name!=='string'||typeof row.identifier!=='string'||typeof row.disabled!=='boolean')throw new Error('invalid_response');
      return {name:row.name.slice(0,120),provider:row.identifier.slice(0,60),disabled:row.disabled};
    });
    return {status:'available',accounts};
  }catch{return {status:'unavailable',accounts:[]};}
}
