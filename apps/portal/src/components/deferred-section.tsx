"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

function hashTarget(): string {
  if (typeof window === "undefined") return "";
  try { return decodeURIComponent(window.location.hash.slice(1)); }
  catch { return window.location.hash.slice(1); }
}

export default function DeferredSection({
  children,
  label,
  targetIds
}: {
  children: ReactNode;
  label: string;
  targetIds: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const targets = useMemo(() => new Set(targetIds.split(/\s+/).filter(Boolean)), [targetIds]);

  useEffect(() => {
    let observer: IntersectionObserver | undefined;
    const revealForHash = () => {
      if (targets.has(hashTarget())) {
        setVisible(true);
        observer?.disconnect();
      }
    };
    const directlyTargeted = targets.has(hashTarget());
    revealForHash();
    window.addEventListener("hashchange", revealForHash);

    if (!directlyTargeted && "IntersectionObserver" in window && rootRef.current) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer?.disconnect();
        }
      }, { rootMargin: "700px 0px" });
      observer.observe(rootRef.current);
    } else {
      setVisible(true);
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("hashchange", revealForHash);
    };
  }, [targets]);

  useEffect(() => {
    const target = hashTarget();
    if (!visible || !targets.has(target)) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const element = document.getElementById(target);
        if (typeof element?.scrollIntoView === "function") element.scrollIntoView({ block: "start" });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [targets, visible]);

  if (visible) return children;
  const sentence = `${label.charAt(0).toLocaleUpperCase("vi")}${label.slice(1)} sẽ mở khi Mẹ cuộn tới.`;
  return (
    <div className="deferred-section" ref={rootRef} aria-busy="true" aria-label={`Đang chờ mở ${label}`}>
      <span aria-hidden="true" />
      <p>{sentence}</p>
    </div>
  );
}
