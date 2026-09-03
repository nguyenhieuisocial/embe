"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import AppHeader from "../../components/app-header";
import { localDateKey } from "../../lib/pregnancy";

type CareEvent = {
  id: string;
  kind: "feeding" | "pumping" | "sleep" | "diaper" | "temperature" | "care";
  occurredAt: string;
  endedAt: string | null;
  caregiver: "mother" | "father";
  details: Record<string, unknown>;
  syncStatus: "pending" | "processing" | "synced" | "failed";
};

const labels: Record<CareEvent["kind"], string> = {
  feeding: "Bú sữa", pumping: "Hút sữa", sleep: "Ngủ", diaper: "Thay tã",
  temperature: "Nhiệt độ", care: "Chăm sóc"
};

function caregiver(): "mother" | "father" {
  return localStorage.getItem("embe:device-role") === "father" ? "father" : "mother";
}

function clock(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function eventDetail(event: CareEvent): string {
  if (event.kind === "feeding") {
    if (event.details.mode === "bottle") return `${event.details.amountMl ?? "—"} ml`;
    return event.details.side === "left" ? "Bên trái" : event.details.side === "right" ? "Bên phải" : event.details.side === "both" ? "Hai bên" : "Chưa chọn bên";
  }
  if (event.kind === "pumping") return `${event.details.amountMl ?? 0} ml`;
  if (event.kind === "diaper") return event.details.wet && event.details.solid ? "Ướt & bẩn" : event.details.wet ? "Ướt" : "Bẩn";
  if (event.kind === "temperature") return `${event.details.temperatureC}°C`;
  return event.endedAt ? `${Math.max(1, Math.round((new Date(event.endedAt).getTime() - new Date(event.occurredAt).getTime()) / 60000))} phút` : "Đang diễn ra";
}

export default function BabyDailyPage() {
  const [day, setDay] = useState("");
  const [events, setEvents] = useState<CareEvent[]>([]);
  const [careLoaded, setCareLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const quickActionHandled = useRef(false);

  useEffect(() => { setDay(localDateKey()); }, []);
  useEffect(() => {
    if (!day) return;
    let active = true;
    setCareLoaded(false);
    void fetch(`/api/baby/care?day=${day}`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ events: CareEvent[] }> : null)
      .then((result) => { if (active && result) setEvents(result.events); })
      .catch(() => undefined)
      .finally(() => { if (active) setCareLoaded(true); });
    return () => { active = false; };
  }, [day]);

  const activeTimers = useMemo(() => events.filter((event) => !event.endedAt && ["feeding", "sleep", "pumping"].includes(event.kind)), [events]);

  const create = useCallback(async (kind: CareEvent["kind"], details: Record<string, unknown>, durationEvent = false) => {
    const now = new Date();
    setBusy(kind);
    setMessage("");
    try {
      const response = await fetch("/api/baby/care", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(), kind, occurredAt: now.toISOString(),
          endedAt: durationEvent ? null : new Date(now.getTime() + 1000).toISOString(),
          caregiver: caregiver(), details
        })
      });
      if (!response.ok) throw new Error("create failed");
      const result = await response.json() as { event: CareEvent };
      setEvents((current) => [result.event, ...current]);
      setMessage(`Đã ghi ${labels[kind].toLowerCase()}.`);
    } catch { setMessage("Chưa ghi được. Hãy thử lại sau một lát."); }
    finally { setBusy(""); }
  }, []);

  useEffect(() => {
    if (!careLoaded || quickActionHandled.current) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("quick") !== "feeding") return;
    quickActionHandled.current = true;
    url.searchParams.delete("quick");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    void create("feeding", { mode: "breast", side: null, amountMl: null, milkType: "breast_milk", note: null }, true);
  }, [careLoaded, create]);

  async function finish(event: CareEvent) {
    setBusy(event.id);
    try {
      const response = await fetch("/api/baby/care", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: event.id, endedAt: new Date().toISOString() })
      });
      if (!response.ok) throw new Error("finish failed");
      const result = await response.json() as { event: CareEvent };
      setEvents((current) => current.map((item) => item.id === event.id ? result.event : item));
      setMessage(`Đã kết thúc ${labels[event.kind].toLowerCase()}.`);
    } catch { setMessage("Chưa kết thúc được. Hãy thử lại."); }
    finally { setBusy(""); }
  }

  async function bottle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await create("feeding", { mode: "bottle", side: null, amountMl: Number(form.get("amountMl")), milkType: form.get("milkType"), note: null });
  }
  async function temperature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await create("temperature", { temperatureC: Number(form.get("temperatureC")), note: null });
  }
  async function pumping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await create("pumping", { side: form.get("side"), amountMl: Number(form.get("amountMl")), note: null });
  }

  return (
    <main className="baby-daily-main">
      <AppHeader note="Đồng bộ với BabyBuddy" tone="calm" />
      <header className="baby-daily-hero"><p className="eyebrow">Chăm Bé · một tay cũng ghi được</p><h1>Bé hôm nay</h1><p>Mỗi lần chỉ chạm đúng việc đang diễn ra.</p></header>

      {activeTimers.length ? <section className="active-care" aria-labelledby="active-care-title">
        <h2 id="active-care-title">Đang diễn ra</h2>
        {activeTimers.map((event) => <button key={event.id} type="button" disabled={busy === event.id} onClick={() => finish(event)}>
          <span><strong>{labels[event.kind]}</strong><small>Bắt đầu {clock(event.occurredAt)}</small></span><b>{busy === event.id ? "Đang lưu…" : "Kết thúc"}</b>
        </button>)}
      </section> : null}

      <section className="care-quick" aria-labelledby="care-quick-title">
        <div><p className="panel-kicker">Thao tác nhanh</p><h2 id="care-quick-title">Bắt đầu ngay</h2></div>
        <div className="care-quick-grid">
          <button type="button" disabled={Boolean(busy)} onClick={() => create("feeding", { mode: "breast", side: "left", amountMl: null, milkType: "breast_milk", note: null }, true)}><span>◖</span><strong>Bú trái</strong></button>
          <button type="button" disabled={Boolean(busy)} onClick={() => create("feeding", { mode: "breast", side: "right", amountMl: null, milkType: "breast_milk", note: null }, true)}><span>◗</span><strong>Bú phải</strong></button>
          <button type="button" disabled={Boolean(busy)} onClick={() => create("sleep", { nap: false, note: null }, true)}><span>☾</span><strong>Bắt đầu ngủ</strong></button>
          <button type="button" disabled={Boolean(busy)} onClick={() => create("diaper", { wet: true, solid: false, color: null, consistency: null, note: null })}><span>◌</span><strong>Tã ướt</strong></button>
          <button type="button" disabled={Boolean(busy)} onClick={() => create("diaper", { wet: false, solid: true, color: null, consistency: null, note: null })}><span>●</span><strong>Tã bẩn</strong></button>
          <button type="button" disabled={Boolean(busy)} onClick={() => create("diaper", { wet: true, solid: true, color: null, consistency: null, note: null })}><span>◉</span><strong>Cả hai</strong></button>
        </div>
        {message ? <p className="form-message" role="status">{message}</p> : null}
      </section>

      <section className="care-more">
        <details><summary>Bình sữa <span>⌄</span></summary><form onSubmit={bottle}><label>Lượng (ml)<input name="amountMl" type="number" inputMode="numeric" min="1" max="1000" defaultValue="60" required /></label><label>Loại sữa<select name="milkType" defaultValue="breast_milk"><option value="breast_milk">Sữa mẹ</option><option value="formula">Sữa công thức</option></select></label><button disabled={Boolean(busy)} type="submit">Ghi bình sữa</button></form></details>
        <details><summary>Hút sữa <span>⌄</span></summary><form onSubmit={pumping}><label>Bên<select name="side" defaultValue="both"><option value="left">Trái</option><option value="right">Phải</option><option value="both">Hai bên</option></select></label><label>Lượng (ml)<input name="amountMl" type="number" inputMode="numeric" min="0" max="2000" required /></label><button disabled={Boolean(busy)} type="submit">Ghi hút sữa</button></form></details>
        <details><summary>Nhiệt độ <span>⌄</span></summary><form onSubmit={temperature}><label>Nhiệt độ (°C)<input name="temperatureC" type="number" inputMode="decimal" min="34" max="43" step="0.1" required /></label><button disabled={Boolean(busy)} type="submit">Lưu nhiệt độ</button></form></details>
        <details><summary>Chăm sóc khác <span>⌄</span></summary><div className="care-other-buttons"><button type="button" onClick={() => create("care", { action: "bath", medicineName: null, dose: null, note: null })}>Đã tắm</button><button type="button" onClick={() => create("care", { action: "cord", medicineName: null, dose: null, note: null })}>Đã chăm rốn</button></div></details>
      </section>

      <section className="care-timeline">
        <div><p className="panel-kicker">{day || "Hôm nay"}</p><h2>Dòng chăm sóc</h2></div>
        {events.length ? <ol>{events.map((event) => <li key={event.id}><time>{clock(event.occurredAt)}</time><span><strong>{labels[event.kind]}</strong><small>{eventDetail(event)} · {event.caregiver === "mother" ? "Mẹ Ngân" : "Ba Hiếu"}</small></span><i title={event.syncStatus === "synced" ? "Đã đồng bộ BabyBuddy" : "Đang chờ đồng bộ"}>{event.syncStatus === "synced" ? "✓" : "↻"}</i></li>)}</ol> : <p className="empty-copy">Chưa có hoạt động nào hôm nay.</p>}
      </section>
      <nav className="baby-hub-links" aria-label="Hồ sơ và phát triển của Bé"><Link href="/be/ho-so"><span>Khám, tiêm & tài liệu</span><b>Hồ sơ của Bé</b></Link><Link href="/be/phat-trien"><span>Số đo & điều mới biết</span><b>Tăng trưởng và cột mốc</b></Link></nav>
    </main>
  );
}
