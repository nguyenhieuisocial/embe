"use client";

import { useEffect, useRef, useState, type PointerEvent } from 'react';

/** Album's image canvas, shared with private medical originals. No fetching, editing or sharing policy here. */
export default function PhotoViewerImage({ src, title, width = 1200, height = 900, total = 1, onMove, onZoomChange, onError,
  rotatable = false, showNavigation = true, fitLabel = 'Đặt ảnh về kích thước ban đầu' }: {
  src: string; title: string; width?: number; height?: number; total?: number; onMove?: (direction: -1 | 1) => void;
  onZoomChange?: (zoom: number) => void; onError?: () => void; rotatable?: boolean; showNavigation?: boolean; fitLabel?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number; zoom: number } | null>(null);
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const usedPinch = useRef(false);
  const zoomRef = useRef(1);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [natural, setNatural] = useState({ width, height });
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const swapped = rotation % 180 !== 0;
  const fit = Math.min(stageSize.width / (swapped ? natural.height : natural.width), stageSize.height / (swapped ? natural.width : natural.height));

  function boundedOffset(x: number, y: number, scale = zoomRef.current) {
    const maxX = Math.max(0, (fit * (swapped ? natural.height : natural.width) * scale - stageSize.width) / 2);
    const maxY = Math.max(0, (fit * (swapped ? natural.width : natural.height) * scale - stageSize.height) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }
  function applyZoom(next: number) {
    const value = Math.min(4, Math.max(1, Math.round(next * 100) / 100));
    zoomRef.current = value; setZoom(value); setOffset(current => boundedOffset(current.x, current.y, value));
  }
  function resetZoom() { zoomRef.current = 1; setZoom(1); setOffset({ x: 0, y: 0 }); }
  function pointerDistance() {
    const values = [...pointers.current.values()];
    return values.length < 2 ? 0 : Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  }
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest('button') || event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      dragStart.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y, zoom: zoomRef.current };
      usedPinch.current = false;
    } else if (pointers.current.size === 2) { pinchStart.current = { distance: pointerDistance(), zoom: zoomRef.current }; usedPinch.current = true; }
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinchStart.current?.distance) { applyZoom(pinchStart.current.zoom * pointerDistance() / pinchStart.current.distance); return; }
    if (pointers.current.size === 1 && dragStart.current && dragStart.current.zoom > 1) {
      setOffset(boundedOffset(dragStart.current.offsetX + event.clientX - dragStart.current.x, dragStart.current.offsetY + event.clientY - dragStart.current.y));
    }
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    const start = dragStart.current; pointers.current.delete(event.pointerId);
    if (event.type !== 'pointercancel' && start?.zoom === 1 && !usedPinch.current) {
      const horizontal = event.clientX - start.x; const vertical = event.clientY - start.y;
      if (Math.abs(horizontal) > 48 && Math.abs(horizontal) > Math.abs(vertical)) onMove?.(horizontal > 0 ? -1 : 1);
    }
    if (pointers.current.size === 0) { dragStart.current = null; pinchStart.current = null; usedPinch.current = false; }
    else {
      const remaining = [...pointers.current.values()][0];
      dragStart.current = { x: remaining.x, y: remaining.y, offsetX: offset.x, offsetY: offset.y, zoom: zoomRef.current };
    }
  }
  useEffect(() => { onZoomChange?.(zoom); }, [zoom, onZoomChange]);
  useEffect(() => {
    const resize = () => { if (stageRef.current) { setStageSize({ width: stageRef.current.clientWidth, height: stageRef.current.clientHeight }); resetZoom(); } };
    resize();
    if (typeof ResizeObserver !== 'undefined') { const observer = new ResizeObserver(resize); observer.observe(stageRef.current!); return () => observer.disconnect(); }
    window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    const viewer = stageRef.current?.closest('[role="dialog"], dialog') ?? stageRef.current;
    const keyboard = (event: Event) => {
      const key = event as KeyboardEvent;
      if ((key.target as Element)?.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (!['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key.key)) return;
      key.preventDefault();
      if (key.key === '+' || key.key === '=') applyZoom(zoomRef.current + .5);
      else if (key.key === '-') applyZoom(zoomRef.current - .5);
      else if (key.key === '0') resetZoom();
      else if (zoomRef.current === 1 && key.key === 'ArrowLeft') onMove?.(-1);
      else if (zoomRef.current === 1 && key.key === 'ArrowRight') onMove?.(1);
      else setOffset(current => boundedOffset(current.x + (key.key === 'ArrowLeft' ? 60 : key.key === 'ArrowRight' ? -60 : 0), current.y + (key.key === 'ArrowUp' ? 60 : key.key === 'ArrowDown' ? -60 : 0)));
    };
    viewer?.addEventListener('keydown', keyboard); return () => viewer?.removeEventListener('keydown', keyboard);
  });
  return <div ref={stageRef} className={`photo-viewer-stage${zoom > 1 ? ' is-zoomed' : ''}`} tabIndex={0} role="region" aria-label="Ảnh, phóng to và kéo để xem"
    onPointerCancel={onPointerUp} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
    onDoubleClick={event => { if (!(event.target as Element).closest('button')) { if (zoom > 1) resetZoom(); else applyZoom(2); } }}>
    {/* Source is supplied by the owner: album endpoint or an authenticated medical blob; never a public optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img alt={title} draggable={false} height={height} width={width} src={src} onError={onError}
      onLoad={event => setNatural({ width: event.currentTarget.naturalWidth || width, height: event.currentTarget.naturalHeight || height })}
      style={{ ...(fit > 0 ? { width: natural.width * fit, height: natural.height * fit } : {}), transform: `translate3d(${offset.x}px, ${offset.y}px, 0)${rotation ? ` rotate(${rotation}deg)` : ''} scale(${zoom})` }} />
    {showNavigation && total > 1 && zoom === 1 ? <>
      <button aria-label="Ảnh trước" className="photo-viewer-prev" onClick={() => onMove?.(-1)} type="button">‹</button>
      <button aria-label="Ảnh sau" className="photo-viewer-next" onClick={() => onMove?.(1)} type="button">›</button>
    </> : null}
    <div className="photo-viewer-zoom" role="group" aria-label="Điều khiển phóng to ảnh">
      <button aria-label="Thu nhỏ ảnh" disabled={zoom === 1} onClick={() => applyZoom(zoom - .5)} type="button">−</button>
      <button aria-label={fitLabel} disabled={zoom === 1 && !rotatable} onClick={resetZoom} type="button">{Math.round(zoom * 100)}%</button>
      <button aria-label="Phóng to ảnh" disabled={zoom === 4} onClick={() => applyZoom(zoom + .5)} type="button">+</button>
      {rotatable ? <button aria-label="Xoay ảnh" type="button" onClick={() => { setRotation(value => (value + 90) % 360); resetZoom(); }}>↻ Xoay</button> : null}
    </div>
  </div>;
}
