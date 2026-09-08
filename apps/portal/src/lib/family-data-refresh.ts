import { clearPrivateGetCache } from './private-get-cache';

export const FAMILY_DATA_REFRESH_EVENT = 'embe:family-data-refresh';

/** Call only after a write is verified. No payload, secrets or medical values cross tabs. */
export function notifyFamilyDataChanged(): void {
  clearPrivateGetCache();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('embe:local-data-changed'));
}

/** Invalidation only: never send health details, credentials or form values. */
export function refreshFamilyData(): void {
  clearPrivateGetCache();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(FAMILY_DATA_REFRESH_EVENT));
}

export function subscribeFamilyDataRefresh(refresh: () => void): () => void {
  window.addEventListener(FAMILY_DATA_REFRESH_EVENT, refresh);
  return () => window.removeEventListener(FAMILY_DATA_REFRESH_EVENT, refresh);
}
