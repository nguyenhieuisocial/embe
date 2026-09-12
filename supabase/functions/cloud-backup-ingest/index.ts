import { AwsClient } from 'npm:aws4fetch@1.0.20';
import { createHandler } from './handler.mjs';

const account = Deno.env.get('EMBE_BACKUP_R2_ACCOUNT') || '';
const accessKeyId = Deno.env.get('EMBE_BACKUP_R2_ACCESS_KEY') || '';
const secretAccessKey = Deno.env.get('EMBE_BACKUP_R2_SECRET_KEY') || '';
const client = new AwsClient({ accessKeyId, secretAccessKey, region: 'auto', service: 's3', retries: 2 });
function url(key: string) {
  if (!/^[a-f0-9]{32}$/.test(account) || !/^cloud-db-v1\/slot-\d{2}\.cms$/.test(key)) throw new Error('Invalid configuration');
  return `https://${account}.r2.cloudflarestorage.com/embe-backup/${key}`;
}
Deno.serve(createHandler({
  token: Deno.env.get('EMBE_CLOUD_BACKUP_TOKEN'),
  async report(metadata: {created: string}) {
    const base = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (base !== 'https://tpqqzowhndbkmkckpbgv.supabase.co' || !serviceKey) throw new Error('status_config');
    if (!metadata.created || !Number.isFinite(Date.parse(metadata.created))) throw new Error('status_time');
    const storedAt = new Date(metadata.created).toISOString();
    const response = await fetch(`${base}/rest/v1/rpc/embe_report_cloud_backup`, {
      method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json',
        'Content-Profile': 'public' },
      body: JSON.stringify({ p_stored_at: storedAt }),
      signal: AbortSignal.timeout(10000),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`status_http_${response.status}`);
  },
  async head(key: string) {
    const res = await client.fetch(url(key), { method: 'HEAD', signal: AbortSignal.timeout(15000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Storage HEAD failed');
    return { date: res.headers.get('x-amz-meta-date'), sha256: res.headers.get('x-amz-meta-sha256'), size: Number(res.headers.get('content-length')), etag: res.headers.get('etag'), created: res.headers.get('last-modified') };
  },
  async put(key: string, body: Uint8Array, metadata: {date: string; sha256: string}, etag?: string) {
    const res = await client.fetch(url(key), { method: 'PUT', body,
      headers: { 'Content-Type': 'application/pkcs7-mime', 'x-amz-meta-date': metadata.date,
        'x-amz-meta-sha256': metadata.sha256, ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }) },
      signal: AbortSignal.timeout(30000) });
    await res.body?.cancel();
    if (res.status === 412 || res.status === 409) return false;
    if (!res.ok) throw new Error('Storage PUT failed');
    return true;
  },
}));
