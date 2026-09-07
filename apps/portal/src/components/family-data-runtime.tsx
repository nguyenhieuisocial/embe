'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { refreshFamilyData } from '../lib/family-data-refresh';

// Push/mutation signals update immediately; visible polling also covers worker
// results and phones without push permission. Never claim iOS runs this closed.
export const FAMILY_SYNC_INTERVAL_MS = 60_000;

export default function FamilyDataRuntime() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || ['/login', '/offline'].includes(pathname) || /^\/(chia-se|in-anh)\//.test(pathname)) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastRefresh = Date.now();
    let pendingRoute = false;
    let channel: BroadcastChannel | undefined;
    try { if ('BroadcastChannel' in window) channel = new BroadcastChannel('embe:data-invalidation'); } catch { /* optional */ }
    const refreshRoute = () => {
      if (!pendingRoute || !active || !navigator.onLine || document.visibilityState === 'hidden') return;
      // Do not disturb typing, the iPhone keyboard, a viewer or an open dialog.
      if (document.activeElement?.matches('input,textarea,select,[contenteditable="true"]') || document.querySelector('[role="dialog"],dialog[open]')) return;
      pendingRoute = false;
      router.refresh(); // merges server data, preserving component state and scroll
    };
    const schedule = () => {
      if (!active || !navigator.onLine || document.visibilityState === 'hidden') return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!active || !navigator.onLine || document.visibilityState === 'hidden') return;
        lastRefresh = Date.now();
        refreshFamilyData(); pendingRoute = true; refreshRoute();
      }, 300);
    };
    const resume = () => { if (Date.now() - lastRefresh > 5000) schedule(); else refreshRoute(); };
    const message = (event: MessageEvent) => {
      if (!['EMBE_DATA_CHANGED', 'EMBE_FAMILY_ACTIVITY'].includes(event.data?.type)) return;
      schedule();
    };
    const localChange = () => { schedule(); channel?.postMessage('changed'); };
    if (channel) channel.onmessage = event => { if (event.data === 'changed') schedule(); };
    window.addEventListener('embe:local-data-changed', localChange);
    window.addEventListener('online', schedule);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    document.addEventListener('focusout', refreshRoute);
    navigator.serviceWorker?.addEventListener('message', message);
    const interval = setInterval(schedule, FAMILY_SYNC_INTERVAL_MS);
    return () => {
      active = false; clearTimeout(timer); clearInterval(interval); channel?.close();
      window.removeEventListener('embe:local-data-changed', localChange);
      window.removeEventListener('online', schedule); window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume); document.removeEventListener('focusout', refreshRoute);
      navigator.serviceWorker?.removeEventListener('message', message);
    };
  }, [pathname, router]);
  return null;
}
