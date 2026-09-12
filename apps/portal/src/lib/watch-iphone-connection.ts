export type IphoneConnectionState = 'waiting' | 'network-error' | 'expired' | 'paused' | 'offline';

/** Read-only receipt for this token. Poll only while visible, in bounded windows. */
export function watchIphoneConnection(
  token: string,
  onState: (state: IphoneConnectionState) => void,
  onReceived: () => void,
) {
  let stopped = false, busy = false, generation = 0;
  let deadline = 0, lastAttempt = -Infinity;
  let timer: ReturnType<typeof setInterval> | undefined;
  let controller: AbortController | undefined;

  function suspend() {
    clearInterval(timer);
    timer = undefined;
    generation++;
    controller?.abort();
    controller = undefined;
    busy = false;
  }

  function finish() {
    stopped = true;
    suspend();
    document.removeEventListener('visibilitychange', visibilityChanged);
    window.removeEventListener('focus', resume);
    window.removeEventListener('online', resume);
    window.removeEventListener('offline', wentOffline);
  }

  async function check() {
    if (stopped || document.visibilityState !== 'visible') return;
    if (!navigator.onLine) { wentOffline(); return; }
    if (Date.now() >= deadline) { suspend(); onState('paused'); return; }
    if (busy || Date.now() - lastAttempt < 5000) return;
    busy = true;
    lastAttempt = Date.now();
    const attempt = ++generation;
    const request = new AbortController();
    controller = request;
    const timeout = setTimeout(() => request.abort(), 10_000);
    try {
      const response = await fetch('/api/pregnancy/iphone-health', {
        cache: 'no-store', headers: { authorization: `Bearer ${token}` }, signal: request.signal,
      });
      if (stopped || attempt !== generation) return;
      if (response.status === 401) { finish(); onState('expired'); return; }
      if (!response.ok) throw new Error('receiver unavailable');
      const receipt = await response.json() as { connected?: boolean; lastSyncedAt?: string | null };
      if (stopped || attempt !== generation) return;
      if (receipt.connected !== true) throw new Error('invalid receipt');
      if (receipt.lastSyncedAt != null) {
        if (typeof receipt.lastSyncedAt !== 'string' || !Number.isFinite(Date.parse(receipt.lastSyncedAt))) {
          throw new Error('invalid sync timestamp');
        }
        finish();
        onReceived();
        return;
      }
      onState('waiting');
    } catch {
      if (!stopped && attempt === generation) onState(navigator.onLine ? 'network-error' : 'offline');
    } finally {
      clearTimeout(timeout);
      if (attempt === generation) { busy = false; controller = undefined; }
    }
  }

  function resume() {
    if (stopped || document.visibilityState !== 'visible') return;
    if (!navigator.onLine) { wentOffline(); return; }
    if (timer === undefined) {
      deadline = Date.now() + 120_000;
      lastAttempt = -Infinity;
      onState('waiting');
      timer = setInterval(() => void check(), 15_000);
    }
    void check();
  }

  function visibilityChanged() {
    if (document.visibilityState === 'visible') resume();
    else suspend();
  }

  function wentOffline() {
    if (stopped) return;
    suspend();
    onState('offline');
  }

  document.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('focus', resume);
  window.addEventListener('online', resume);
  window.addEventListener('offline', wentOffline);
  resume();
  return finish;
}
