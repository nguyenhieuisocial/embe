'use client';
import { useEffect, useState } from 'react';
import './pull-to-refresh.css';

/** A deliberate downward pull at the document top; never captures nested scrollers or zoom. */
export default function PullToRefresh() {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let pulled = 0, busy = false, edited = false;
    let recovery: ReturnType<typeof setTimeout> | undefined;
    const reset = () => { start = null; pulled = 0; setDistance(0); };
    const edit = () => { edited = true; };
    const begin = (event: TouchEvent) => {
      reset();
      if (busy || event.touches.length !== 1 || window.scrollY > 0 || (window.visualViewport?.scale ?? 1) !== 1) return;
      if (document.querySelector('dialog[open],[role="dialog"],[aria-modal="true"]')) return;
      let node = event.target instanceof Element ? event.target : null;
      if (node?.closest('input,textarea,select,button,a,video,iframe,[contenteditable="true"],.photo-viewer-image')) return;
      while (node && node !== document.body && node !== document.documentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight
          || /(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth) return;
        node = node.parentElement;
      }
      setMessage(''); start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1 || window.scrollY > 0 || (window.visualViewport?.scale ?? 1) !== 1) { reset(); return; }
      const dx = event.touches[0].clientX - start.x, dy = event.touches[0].clientY - start.y;
      if (dy <= 0 || Math.abs(dx) > dy) { reset(); return; }
      if (dy < 12 && Math.abs(dx) < 12) return;
      if (!event.cancelable) { reset(); return; }
      event.preventDefault();
      pulled = Math.min(dy, 140); setDistance(pulled);
    };
    const end = () => {
      const ready = pulled >= 100; reset();
      if (!ready || busy) return;
      if (!navigator.onLine) { setMessage('Chưa có mạng. Dữ liệu đang xem vẫn được giữ.'); return; }
      if (edited && !window.confirm('Tải lại trang có thể mất nội dung chưa lưu hoặc ngắt tải file. Bạn muốn tiếp tục?')) return;
      busy = true; setRefreshing(true);
      // beforeunload can cancel navigation (for example an upload guard). Restore usability.
      recovery = setTimeout(() => {
        busy = false; setRefreshing(false); setMessage('Trang chưa tải lại. Bạn có thể thử lại sau khi lưu xong.');
      }, 12000);
      window.history.go(0);
    };
    document.addEventListener('input', edit, true);
    document.addEventListener('change', edit, true);
    document.addEventListener('touchstart', begin, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', reset);
    document.addEventListener('visibilitychange', reset);
    return () => {
      document.removeEventListener('input', edit, true); document.removeEventListener('change', edit, true);
      document.removeEventListener('touchstart', begin); document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end); document.removeEventListener('touchcancel', reset);
      document.removeEventListener('visibilitychange', reset); clearTimeout(recovery);
    };
  }, []);
  return distance > 15 || refreshing || message ? <div className="pull-refresh-hint">
    <span className="pull-refresh-symbol" aria-hidden="true" style={{ transform: `rotate(${distance >= 100 ? 180 : 0}deg)` }}>{refreshing ? '↻' : '↓'}</span>
    <span role="status">{message || (refreshing ? 'Đang tải lại EmBe…' : distance >= 100 ? 'Thả tay để tải lại' : 'Kéo xuống để tải lại')}</span>
    {message ? <button type="button" aria-label="Đóng thông báo làm mới" onClick={() => setMessage('')}>×</button> : null}
  </div> : null;
}
