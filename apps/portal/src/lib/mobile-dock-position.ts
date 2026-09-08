/** Repair a displaced fixed footer without scrolling the document or fighting pinch zoom.
 * iOS can retain a keyboard-era fixed-position origin while scrolling after blur.
 * Measure the rendered bar; do not assume visualViewport.offsetTop is reliable there.
 */
export function observeMobileDock(root: HTMLElement): () => void {
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && !CSS.supports('translate', '0 1px')) return () => {};
  let offset = 0;
  let frame = 0;
  let settle = 0;
  let active = true;
  const viewport = window.visualViewport;
  function setOffset(next: number) {
    if (next === offset) return;
    offset = next;
    if (next) root.style.setProperty('--embe-dock-offset', `${next}px`);
    else root.style.removeProperty('--embe-dock-offset');
  }
  function measure() {
    frame = 0;
    if (!active) return;
    const nav = root.querySelector<HTMLElement>('.family-nav');
    if (window.innerWidth >= 768 || !nav || Math.abs((viewport?.scale ?? 1) - 1) > .02) { setOffset(0); return; }
    // Modal scroll locks own their position until they release the page.
    if (document.body.style.position === 'fixed' || root.inert || nav.inert) return;
    const rect = nav.getBoundingClientRect();
    if (rect.height === 0) return; // Hidden for keyboard/press; keep the last anchor.
    const next = Math.round(window.innerHeight - (rect.bottom - offset));
    if (!Number.isFinite(next) || Math.abs(next) > window.innerHeight) return;
    setOffset(Math.abs(next) <= 2 ? 0 : next);
  }
  function schedule() { if (active && !frame) frame = requestAnimationFrame(measure); }
  function afterFocus() {
    schedule();
    window.clearTimeout(settle);
    settle = window.setTimeout(schedule, 350); // Keyboard dismissal can finish after blur.
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
  viewport?.addEventListener('resize', schedule, { passive: true });
  viewport?.addEventListener('scroll', schedule, { passive: true });
  root.addEventListener('focusin', afterFocus);
  root.addEventListener('focusout', afterFocus);
  root.addEventListener('pointerup', schedule, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  const size = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  const nav = root.querySelector('.family-nav'); if (nav) size?.observe(nav);
  schedule();
  return () => {
    active = false; cancelAnimationFrame(frame); window.clearTimeout(settle); size?.disconnect();
    window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); window.removeEventListener('pageshow', schedule);
    viewport?.removeEventListener('resize', schedule); viewport?.removeEventListener('scroll', schedule);
    root.removeEventListener('focusin', afterFocus); root.removeEventListener('focusout', afterFocus); root.removeEventListener('pointerup', schedule);
    document.removeEventListener('visibilitychange', schedule);
    root.style.removeProperty('--embe-dock-offset');
  };
}
