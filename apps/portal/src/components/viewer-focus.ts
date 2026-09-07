import type { KeyboardEvent } from 'react';

/** Shared by album and medical viewers, including browsers that move Tab into browser chrome. */
export function trapViewerFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Tab' || event.defaultPrevented) return;
  const root = event.currentTarget;
  const focusable = [...root.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled):not([type="hidden"]),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')]
    .filter(node => !node.closest('[hidden]') && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden');
  const first = focusable[0]; const last = focusable.at(-1);
  if (!first || !last) { event.preventDefault(); root.focus(); return; }
  if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
}
