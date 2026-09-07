import { memberAuthorization } from '../../../../../lib/family-members-server';
import { studioAsset, studioScript, studioSubtitles, studioTopic } from '../../../../../lib/studio';

export const runtime = 'nodejs';
type Context = { params: Promise<{ slug: string; kind: string }> };
const privacy = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(request: Request, context: Context): Promise<Response> {
  const denied = await memberAuthorization(request);
  if (denied) return denied;
  const { slug, kind } = await context.params;
  const topic = studioTopic(slug);
  if (!topic || !['video', 'poster', 'script', 'subtitles'].includes(kind)) return new Response('Not found', { status: 404, headers: privacy });
  const download = new URL(request.url).searchParams.get('download') === '1';
  if (kind === 'script' || kind === 'subtitles') {
    return new Response(kind === 'script' ? studioScript(topic) : studioSubtitles(topic), { headers: {
      ...privacy, 'Content-Type': kind === 'script' ? 'text/plain; charset=utf-8' : 'text/vtt; charset=utf-8',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="embe-${slug}.${kind === 'script' ? 'txt' : 'vtt'}"`
    } });
  }
  const asset = studioAsset(slug, kind as 'video' | 'poster');
  const base = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SECRET_KEY;
  if (!asset || !base || !key) return new Response('Temporarily unavailable', { status: 503, headers: privacy });
  let start = 0; let end = asset.size - 1; let partial = false;
  const range = request.headers.get('range');
  const etag = `"sha256-${asset.checksum}"`;
  if (range && (!request.headers.get('if-range') || request.headers.get('if-range') === etag)) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { ...privacy, 'Content-Range': `bytes */${asset.size}` } });
    if (!match[1]) start = Math.max(0, asset.size - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= asset.size) return new Response(null, { status: 416, headers: { ...privacy, 'Content-Range': `bytes */${asset.size}` } });
    partial = true;
  }
  try {
    // Content-addressed, build-approved objects only. Never redirect a browser to provider URLs.
    if (!/^editorial\/[a-f0-9]{64}\.(mp4|png)$/.test(asset.path) || asset.size > 4_000_000) throw new Error('invalid_asset');
    const upstream = await fetch(`${new URL(base).origin}/storage/v1/object/authenticated/embe-studio-drafts/${asset.path}`, {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    if (!upstream.ok || upstream.headers.get('content-type')?.split(';')[0] !== asset.mime) throw new Error('unavailable');
    // These small draft files are capped by the publisher. Bounded buffering makes Range reliable
    // even when a storage gateway ignores Range, including Safari's bytes=0-1 probe.
    const reader = upstream.body?.getReader(); if (!reader) throw new Error('missing_body');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
        if (size > asset.size) { await reader.cancel(); throw new Error('size_mismatch'); } chunks.push(part.value); }
    } finally { reader.releaseLock(); }
    if (size !== asset.size) throw new Error('size_mismatch');
    const body = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    const { createHash } = await import('node:crypto');
    if (createHash('sha256').update(body).digest('hex') !== asset.checksum) throw new Error('checksum_mismatch');
    return new Response(body.slice(start, end + 1), { status: partial ? 206 : 200, headers: {
      ...privacy, 'Content-Type': asset.mime, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', ETag: etag,
      ...(partial ? { 'Content-Range': `bytes ${start}-${end}/${asset.size}` } : {}),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="embe-${slug}.${kind === 'video' ? 'mp4' : 'png'}"`
    } });
  } catch { return new Response('Temporarily unavailable', { status: 503, headers: privacy }); }
}
