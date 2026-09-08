import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { observeMobileDock } from '../src/lib/mobile-dock-position';

let root: HTMLDivElement; let nav: HTMLElement; let stop: () => void;
let bottom: number; let height: number; let viewport: EventTarget & { scale: number };
let frames: Map<number, FrameRequestCallback>; let id: number;
const offset = () => Number.parseFloat(root.style.getPropertyValue('--embe-dock-offset')) || 0;
const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(0)); };
beforeEach(() => {
  vi.useFakeTimers(); id = 0; frames = new Map(); bottom = 852; height = 64;
  vi.stubGlobal('innerWidth', 393); vi.stubGlobal('innerHeight', 852);
  viewport = Object.assign(new EventTarget(), { scale: 1 }); vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++id, fn); return id; });
  vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  root = document.createElement('div'); nav = document.createElement('nav'); nav.className = 'family-nav'; root.append(nav); document.body.append(root);
  vi.spyOn(nav, 'getBoundingClientRect').mockImplementation(() => ({ height, bottom: bottom + offset() }) as DOMRect);
  stop = observeMobileDock(root); flush();
});
afterEach(() => { stop(); root.remove(); document.body.style.position = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('leaves correctly anchored navigation alone and coalesces scroll events into one frame', () => {
  for (let n = 0; n < 30; n++) window.dispatchEvent(new Event('scroll'));
  expect(frames.size).toBe(1); flush(); expect(offset()).toBe(0); expect(window.scrollTo).not.toHaveBeenCalled();
});
it('corrects a keyboard-era floating origin and does not accumulate translation on later scrolls', () => {
  bottom = 552; window.dispatchEvent(new Event('scroll')); flush(); expect(offset()).toBe(300);
  for (let n = 0; n < 5; n++) { viewport.dispatchEvent(new Event('scroll')); flush(); expect(offset()).toBe(300); }
  bottom = 852; viewport.dispatchEvent(new Event('resize')); flush(); expect(offset()).toBe(0);
  expect(window.scrollTo).not.toHaveBeenCalled();
});
it('remeasures after blur settles and after viewport resize without changing the reading position', () => {
  bottom = 600; root.dispatchEvent(new FocusEvent('focusout')); flush(); expect(offset()).toBe(252);
  bottom = 852; vi.advanceTimersByTime(350); flush(); expect(offset()).toBe(0);
  vi.stubGlobal('innerHeight', 700); bottom = 680; window.dispatchEvent(new Event('resize')); flush(); expect(offset()).toBe(20);
  expect(window.scrollTo).not.toHaveBeenCalled();
});
it('does not measure hidden navigation, override a modal scroll lock, or fight pinch zoom', () => {
  bottom = 552; window.dispatchEvent(new Event('scroll')); flush(); expect(offset()).toBe(300);
  height = 0; root.dispatchEvent(new Event('pointerup')); flush(); expect(offset()).toBe(300);
  height = 64; bottom = 852; document.body.style.position = 'fixed'; window.dispatchEvent(new Event('scroll')); flush(); expect(offset()).toBe(300);
  document.body.style.position = ''; viewport.scale = 2; viewport.dispatchEvent(new Event('resize')); flush(); expect(offset()).toBe(0);
  bottom = 552; viewport.dispatchEvent(new Event('scroll')); flush(); expect(offset()).toBe(0);
});
it('removes correction on tablet/desktop and releases listeners, styles and timers on unmount', () => {
  bottom = 552; window.dispatchEvent(new Event('scroll')); flush(); expect(offset()).toBe(300);
  vi.stubGlobal('innerWidth', 1024); window.dispatchEvent(new Event('resize')); flush(); expect(offset()).toBe(0);
  vi.stubGlobal('innerWidth', 393); root.dispatchEvent(new FocusEvent('focusout')); stop();
  vi.advanceTimersByTime(400); window.dispatchEvent(new Event('scroll')); viewport.dispatchEvent(new Event('resize'));
  expect(frames.size).toBe(0); expect(root.style.getPropertyValue('--embe-dock-offset')).toBe('');
});
