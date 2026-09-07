import { unstable_cache } from 'next/cache';
import { memberAuthorization } from '../../../../lib/family-members-server';

export const runtime = 'nodejs';
const source = 'https://trends.google.com/trending/rss?geo=VN';
const privacy = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
async function fetchPublicTrends() {
  // Fixed public destination, no caller-controlled URL, headers, cookies or redirect follow.
  try {
    const response = await fetch(source, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('xml')) throw new Error('upstream');
    const reader = response.body?.getReader(); if (!reader) throw new Error('body');
    const parts: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength;
        if (size > 1000000) { await reader.cancel(); throw new Error('size'); } parts.push(chunk.value); }
    } finally { reader.releaseLock(); }
    const xml = Buffer.concat(parts).toString('utf8');
    if (!xml.includes('<rss') || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('xml');
    return { status: 'ready' as const, xml, checkedAt: new Date().toISOString(), source };
  } catch { return { status: 'unavailable' as const, xml: '', checkedAt: new Date().toISOString(), source }; }
}
// Public-only payload cached across requests, including failure cooldown. Auth is ALWAYS outside.
const publicTrends = unstable_cache(fetchPublicTrends, ['studio-google-trends-vn-v1'], { revalidate: 900 });
export async function GET(request: Request) {
  const denied = await memberAuthorization(request); if (denied) return denied;
  const result = await publicTrends();
  return Response.json(result, { status: result.status === 'ready' ? 200 : 503, headers: { ...privacy, ...(result.status === 'unavailable' ? { 'Retry-After': '900' } : {}) } });
}
