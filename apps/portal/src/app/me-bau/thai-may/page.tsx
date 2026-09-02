"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "../../../components/app-header";

type MovementSession = { id: string; startedAt: string; endedAt: string | null; movementCount: number; note: string; createdAt: string };
function clockDuration(startedAt: string, endedAt: string | null, now: number): string {
  const seconds = Math.max(0, Math.floor(((endedAt ? new Date(endedAt).getTime() : now) - new Date(startedAt).getTime()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function FetalMovementPage() {
  const [sessions, setSessions] = useState<MovementSession[]>([]), [note, setNote] = useState("");
  const [now, setNow] = useState(Date.now()), [busy, setBusy] = useState(false), [message, setMessage] = useState("Đang mở lịch sử…");
  const tapQueue = useRef<Promise<void>>(Promise.resolve()), pendingTaps = useRef(0);
  const active = sessions.find((session) => !session.endedAt) ?? null;
  useEffect(() => { void fetch("/api/pregnancy/fetal-movements", { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error();
    const result = await response.json() as { sessions?: MovementSession[] };
    setSessions(result.sessions ?? []); setMessage(result.sessions?.length ? "Đã mở lịch sử gần đây." : "Chưa có phiên nào.");
  }).catch(() => setMessage("Chưa thể mở lịch sử. Thử lại sau nhé.")); }, []);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);

  async function action(kind: "start" | "movement" | "finish") {
    if (kind === "movement") {
      if (!active) return;
      const id = active.id;
      pendingTaps.current += 1;
      setSessions((current) => current.map((session) => session.id === id ? { ...session, movementCount: session.movementCount + 1 } : session));
      setMessage("Đã ghi một cử động.");
      tapQueue.current = tapQueue.current.then(async () => {
        try {
          const response = await fetch("/api/pregnancy/fetal-movements", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "movement", id, at: new Date().toISOString() }) });
          if (!response.ok) throw new Error();
          const result = await response.json() as { session: MovementSession };
          pendingTaps.current -= 1;
          setSessions((current) => current.map((session) => session.id === id ? { ...result.session, movementCount: Math.max(session.movementCount, result.session.movementCount + pendingTaps.current) } : session));
        } catch {
          pendingTaps.current -= 1;
          setSessions((current) => current.map((session) => session.id === id ? { ...session, movementCount: Math.max(0, session.movementCount - 1) } : session));
          setMessage("Một lần chạm chưa lưu được. Chạm lại khi có mạng.");
        }
      });
      return;
    }
    if (busy || !new Set(["start", "finish"]).has(kind) || (kind === "finish" && !active)) return;
    setBusy(true); const id = active?.id ?? crypto.randomUUID(), previous = sessions, at = new Date().toISOString();
    setMessage("Đang lưu…");
    try {
      if (kind === "finish") await tapQueue.current;
      const response = await fetch("/api/pregnancy/fetal-movements", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: kind, id, at, ...(kind === "finish" ? { note } : {}) }) });
      if (!response.ok) throw new Error();
      const result = await response.json() as { session: MovementSession };
      setSessions((current) => [result.session, ...current.filter((session) => session.id !== id)]);
      if (kind === "finish") setNote("");
      setMessage(kind === "start" ? "Đã bắt đầu." : "Đã lưu phiên ghi.");
    } catch { setSessions(previous); setMessage("Chưa lưu được. Kiểm tra mạng rồi thử lại."); }
    finally { setBusy(false); }
  }

  const history = useMemo(() => sessions.filter((session) => session.endedAt).slice(0, 10), [sessions]);
  return <main className="pregnancy-main fetal-movement-page"><AppHeader note="Theo dõi theo nhịp riêng của Bé" tone="calm" />
    <header className="pregnancy-hero compact-page-hero"><div><p className="eyebrow">Ghi nhanh bằng một tay</p><h1>Ghi nhịp thai máy</h1><p className="intro">Giúp nhớ nhịp hoạt động quen thuộc để trao đổi với nơi khám, không dùng để tự kết luận sức khỏe của Bé.</p></div></header>
    <section className="movement-counter" aria-live="polite"><span>{active ? clockDuration(active.startedAt, null, now) : "Sẵn sàng"}</span><strong>{active ? `${active.movementCount} lần` : "Bắt đầu khi Mẹ muốn ghi"}</strong>
      {active ? <><button className="movement-tap" type="button" onClick={() => void action("movement")}>Bé vừa cử động</button><textarea aria-label="Ghi chú phiên thai máy" maxLength={500} placeholder="Ghi chú ngắn, không bắt buộc" rows={2} value={note} onChange={(event) => setNote(event.target.value)} /><button className="movement-finish" disabled={busy} type="button" onClick={() => void action("finish")}>Kết thúc và lưu</button></> : <button className="movement-start" disabled={busy} type="button" onClick={() => void action("start")}>Bắt đầu ghi</button>}<small>{message}</small>
    </section>
    <aside className="medical-boundary urgent-movement-note"><strong>Quan trọng: không có một con số chuẩn áp dụng cho mọi em bé.</strong><p>Nếu Bé cử động ít hơn thường lệ, ngừng cử động hoặc nhịp quen thuộc thay đổi, liên hệ nơi theo dõi thai ngay và không đợi đến ngày hôm sau.</p><a href="/chuan-bi-sinh">Gọi nơi khám ngay</a></aside>
    {history.length ? <section className="section" aria-labelledby="movement-history-title"><p className="panel-kicker">Gần đây</p><h2 id="movement-history-title">Các phiên đã lưu</h2><ul className="movement-history">{history.map((session) => <li key={session.id}><span><strong>{new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(session.startedAt))}</strong><small>{session.note || "Không có ghi chú"}</small></span><b>{session.movementCount} lần · {clockDuration(session.startedAt, session.endedAt, now)}</b></li>)}</ul></section> : null}
    <p className="movement-source">Tham khảo an toàn: <a href="https://www.nhs.uk/pregnancy/keeping-well/your-babys-movements/" target="_blank" rel="noreferrer">NHS · Cử động của thai nhi ↗</a></p>
  </main>;
}
