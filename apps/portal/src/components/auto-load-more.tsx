"use client";

import { useEffect, useRef, useState } from "react";
import "./auto-load-more.css";

// One sentinel for the gallery, weekly memories and photo picker. Keep paging
// separate from image decoding: approaching the end requests metadata, not originals.
export default function AutoLoadMore({ hasMore, loading, error, paused = false, pageKey, onLoadMore, label = "ảnh" }: {
  hasMore: boolean;
  loading: boolean;
  error: boolean;
  paused?: boolean;
  pageKey: string | number;
  onLoadMore: () => Promise<void>;
  label?: string;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const action = useRef(onLoadMore);
  const inFlight = useRef(false);
  const [automatic, setAutomatic] = useState(false);
  useEffect(() => { action.current = onLoadMore; }, [onLoadMore]);
  useEffect(() => { setAutomatic("IntersectionObserver" in window); }, []);

  async function load() {
    if (inFlight.current) return;
    inFlight.current = true;
    try { await action.current(); }
    finally { inFlight.current = false; }
  }

  useEffect(() => {
    if (!automatic || !hasMore || loading || error || paused || !sentinel.current) return;
    let active = true;
    let requested = false;
    const observer = new IntersectionObserver(entries => {
      if (!active || requested || !entries.some(entry => entry.isIntersecting) || document.visibilityState === "hidden") return;
      requested = true;
      observer.disconnect();
      void load();
    }, { root: sentinel.current.closest("[data-photo-scroll]"), rootMargin: "0px 0px 600px 0px" });
    observer.observe(sentinel.current);
    const resume = () => {
      if (document.visibilityState !== "hidden" && !requested && sentinel.current) {
        observer.disconnect(); observer.observe(sentinel.current);
      }
    };
    document.addEventListener("visibilitychange", resume);
    return () => { active = false; observer.disconnect(); document.removeEventListener("visibilitychange", resume); };
    // A new page may still end inside the viewport (e.g. photos grouped by day).
    // Observe it again after each successful page; never retry errors in a loop.
  }, [automatic, hasMore, loading, error, paused, pageKey]);

  if (!hasMore) return null;
  return <div ref={sentinel} className="auto-load-more" aria-busy={loading}>
    {loading ? <span role="status">Đang tải thêm {label}…</span> : null}
    {error ? <span role="status">Chưa tải được {label} tiếp theo.</span> : null}
    <button type="button" className={automatic && !error ? "auto-load-keyboard" : ""}
      disabled={loading || paused} onClick={() => void load()}>
      {error ? "Thử lại" : `Tải thêm ${label}`}
    </button>
  </div>;
}
