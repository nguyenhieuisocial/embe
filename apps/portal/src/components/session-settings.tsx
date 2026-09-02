"use client";

import { useEffect, useState } from "react";

type Session = { id: string; deviceName: string; authMethod: string; createdAt: string; lastSeenAt: string; current: boolean };

export default function SessionSettings() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { void fetch("/api/auth/sessions", { cache: "no-store" }).then(async (response) => {
    if (!response.ok) return;
    const body = await response.json() as { sessions?: Session[] };
    if (Array.isArray(body.sessions)) setSessions(body.sessions);
  }).catch(() => undefined); }, []);

  async function revoke(action: "all" | "one", id?: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/sessions", { method: "DELETE", headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "all" ? { action } : { action, id }) });
      if (!response.ok) throw new Error("unavailable");
      if (action === "all" || sessions.some((item) => item.id === id && item.current)) window.location.assign("/login");
      else setSessions((current) => current.filter((item) => item.id !== id));
    } catch { setMessage("Chưa đăng xuất được. Vui lòng thử lại."); }
    finally { setBusy(false); }
  }

  return <section className="section passkey-settings" aria-labelledby="session-settings-title">
    <div className="section-head"><p className="panel-kicker">Phiên đang đăng nhập</p><h2 id="session-settings-title">Thiết bị của gia đình</h2></div>
    <p>Tên thiết bị và lần hoạt động gần nhất; EmBe không lưu địa chỉ IP.</p>
    {sessions.length ? <ul className="passkey-device-list">{sessions.map((session) => <li key={session.id}>
      <span><strong>{session.deviceName}{session.current ? " · máy này" : ""}</strong><small>{session.authMethod === "passkey" ? "Face ID" : "Mật khẩu"} · {new Date(session.lastSeenAt).toLocaleString("vi-VN")}</small></span>
      {!session.current ? <button disabled={busy} onClick={() => void revoke("one", session.id)} type="button">Đăng xuất</button> : null}
    </li>)}</ul> : <p className="settings-saved">Đang tải danh sách…</p>}
    <button className="btn btn-secondary" disabled={busy || !sessions.length} onClick={() => void revoke("all")} type="button">Đăng xuất tất cả</button>
    {message ? <p role="status" className="settings-saved">{message}</p> : null}
  </section>;
}
