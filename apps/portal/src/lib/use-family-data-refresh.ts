'use client';
import { useEffect, useRef } from 'react';
import { subscribeFamilyDataRefresh } from './family-data-refresh';

/** Refresh displayed data, never reset a draft or overlap a mutation. */
export function useFamilyDataRefresh(refresh: (canApply: () => boolean) => void | Promise<void>, enabled = true): void {
  const latest = useRef({ refresh, enabled });
  const generation = useRef(0);
  if (latest.current.enabled !== enabled) generation.current++;
  latest.current = { refresh, enabled };
  const pending = useRef(false);
  const running = useRef(false);
  const wake = useRef<() => void>(() => {});
  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!active || !pending.current || running.current || !latest.current.enabled
        || !navigator.onLine || document.visibilityState === 'hidden') return;
      pending.current = false; running.current = true;
      const revision = generation.current;
      const canApply = () => active && latest.current.enabled && revision === generation.current;
      try { await latest.current.refresh(canApply); } catch { /* Existing data stays visible; next signal retries. */ }
      finally {
        running.current = false;
        if (active && !canApply()) pending.current = true;
        if (active && pending.current && latest.current.enabled) void run();
      }
    };
    wake.current = () => { void run(); };
    const unsubscribe = subscribeFamilyDataRefresh(() => { pending.current = true; void run(); });
    return () => { active = false; unsubscribe(); };
  }, []);
  useEffect(() => { if (enabled) wake.current(); }, [enabled]);
}
