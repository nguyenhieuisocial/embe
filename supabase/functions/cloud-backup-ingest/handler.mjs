// Only ciphertext enters this API. No download/delete/list capability is exposed.
export const MAX_BYTES = 16 * 1024 * 1024;
export function backupSlot(now) {
  const day = Math.floor(now.getTime() / 86400000);
  return { key: `cloud-db-v1/slot-${String(day % 35).padStart(2, '0')}.cms`, date: now.toISOString().slice(0, 10) };
}
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function sameSecret(provided, expected) {
  if (!/^[a-f0-9]{64}$/.test(expected || '') || !/^[a-f0-9]{64}$/.test(provided || '')) return false;
  const a = await sha256(new TextEncoder().encode(provided));
  const b = await sha256(new TextEncoder().encode(expected));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function reply(status, body) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function createHandler({ token, head, put, report = async () => {}, now = () => new Date() }) {
  return async request => {
    if (!await sameSecret(request.headers.get('Authorization')?.replace(/^Bearer /, ''), token)) return reply(401, { error: 'unauthorized' });
    if (!['HEAD', 'POST'].includes(request.method)) return reply(405, { error: 'method_not_allowed' });
    let phase = 'storage_head';
    try {
      const { key, date } = backupSlot(now());
      const existing = await head(key);
      if (request.method === 'HEAD') {
        if (existing?.date === date) { phase = 'status_report'; await report(existing); }
        return new Response(null, { status: existing?.date === date ? 204 : 404, headers: { 'Cache-Control': 'no-store' } });
      }
      // Immutable within a day; recycling can replace only a slot from >=35 days ago.
      if (existing && (!/^\d{4}-\d{2}-\d{2}$/.test(existing.date || '') || existing.date >= date)) return reply(409, { error: 'slot_already_saved' });
      const age = existing ? new Date(`${date}T00:00:00Z`) - new Date(`${existing.date}T00:00:00Z`) : Infinity;
      if (existing && (!Number.isFinite(age) || age < 35 * 86400000)) return reply(409, { error: 'slot_not_expired' });
      if (request.headers.get('Content-Type') !== 'application/pkcs7-mime') return reply(415, { error: 'ciphertext_required' });
      const length = Number(request.headers.get('Content-Length'));
      if (!Number.isSafeInteger(length) || length < 512 || length > MAX_BYTES) return reply(413, { error: 'size_limit' });
      const digest = request.headers.get('X-Content-SHA256');
      if (!/^[a-f0-9]{64}$/.test(digest || '')) return reply(400, { error: 'checksum_required' });
      const reader = request.body?.getReader();
      if (!reader) return reply(400, { error: 'empty_body' });
      const chunks = []; let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > length || size > MAX_BYTES) { await reader.cancel(); return reply(413, { error: 'size_limit' }); }
        chunks.push(value);
      }
      const body = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      if (size !== length || await sha256(body) !== digest) return reply(400, { error: 'checksum_mismatch' });
      // CMS authenticated enveloped-data OID. Reject accidental plaintext dumps.
      const oid = [0x06,0x0b,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x09,0x10,0x01,0x17];
      if (body[0] !== 0x30 || ![2,3,4,5,6].some(i => oid.every((v,j) => body[i+j] === v))) return reply(415, { error: 'cms_auth_envelope_required' });
      phase = 'storage_put';
      const saved = await put(key, body, { date, sha256: digest }, existing?.etag);
      if (!saved) return reply(409, { error: 'concurrent_upload' });
      // A read-after-write HEAD must confirm bytes and metadata, not just a successful PUT.
      phase = 'storage_verify';
      const verified = await head(key);
      if (verified?.date !== date || verified?.sha256 !== digest || verified?.size !== size) return reply(502, { error: 'storage_verification_failed' });
      phase = 'status_report'; await report(verified);
      return reply(201, { saved: true, date, sha256: digest, bytes: size, retainedSlots: 35 });
    } catch (error) {
      const code = error instanceof Error && /^status_(?:config|time|http_\d{3})$/.test(error.message) ? error.message : 'unavailable';
      return new Response(JSON.stringify({ error: 'backup_storage_unavailable', phase, code }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Backup-Phase': phase, 'X-Backup-Error': code } });
    }
  };
}
