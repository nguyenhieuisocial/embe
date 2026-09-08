// Postiz public API: https://docs.postiz.com/public-api/integrations/list
// Read-only inventory. A listed account is NOT proof of permission to publish.
export type StudioConnection = {name:string;provider:string;disabled:boolean};
export type StudioConnections = {status:'not_configured'|'available'|'authorization_required'|'unavailable';accounts:StudioConnection[]};
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
