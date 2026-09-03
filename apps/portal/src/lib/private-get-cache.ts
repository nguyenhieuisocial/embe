type CacheEntry = {
  expiresAt: number;
  response: Promise<Response>;
};

// Returning to a tool stays instant. Writes invalidate their own data and the
// family-activity channel clears all entries when the other phone changes data.
const CACHE_MS = 5 * 60_000;
const entries = new Map<string, CacheEntry>();

/**
 * Shares short bursts of identical private GETs in memory only. Responses never
 * enter localStorage, the service worker, or a public CDN cache.
 */
export async function cachedPrivateGet(url: string): Promise<Response> {
  const now = Date.now();
  const current = entries.get(url);
  if (current && current.expiresAt > now) return (await current.response).clone();
  if (current) entries.delete(url);

  const response = fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { accept: "application/json" }
  }).then((value) => {
    if (!value.ok) entries.delete(url);
    return value;
  }).catch((error) => {
    entries.delete(url);
    throw error;
  });

  entries.set(url, { expiresAt: now + CACHE_MS, response });
  return (await response).clone();
}

export function clearPrivateGetCache(prefix?: string): void {
  if (!prefix) {
    entries.clear();
    return;
  }
  for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
}
