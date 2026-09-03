"use client";

import { useEffect, useRef, useState } from "react";

export default function ViewportImage({ alt, eager = false, height, src, width }: {
  alt: string;
  eager?: boolean;
  height: number;
  src: string;
  width: number;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState(eager);

  useEffect(() => {
    if (visible) return;
    if (!("IntersectionObserver" in window) || !imageRef.current) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: "160px" });
    observer.observe(imageRef.current);
    return () => observer.disconnect();
  }, [visible]);

  return (
    // Private media stays behind the authenticated endpoint; the source is
    // attached only when this frame is close to the mobile viewport.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} decoding="async" height={height} loading="lazy" ref={imageRef}
      src={visible ? src : undefined} width={width} />
  );
}
