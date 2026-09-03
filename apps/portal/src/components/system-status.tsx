"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ServiceState = "ready" | "limited" | "paused" | "setup";
type StatusPayload = {
  services: Record<"data" | "journal" | "food" | "assistant" | "notifications" | "photos", ServiceState>;
  notificationRoles: { mother: boolean; father: boolean };
};

const serviceNames: Array<[keyof StatusPayload["services"], string]> = [
  ["data", "Dữ liệu gia đình"],
  ["journal", "Nhật ký"],
  ["food", "Nhận diện món ăn"],
  ["assistant", "Trợ lý"],
  ["notifications", "Thông báo"],
  ["photos", "Thư viện ảnh"]
];

function validPayload(value: unknown): value is StatusPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (!payload.services || typeof payload.services !== "object" || Array.isArray(payload.services)
      || !payload.notificationRoles || typeof payload.notificationRoles !== "object" || Array.isArray(payload.notificationRoles)) return false;
  const services = payload.services as Record<string, unknown>;
  const roles = payload.notificationRoles as Record<string, unknown>;
  return serviceNames.every(([key]) => ["ready", "limited", "paused", "setup"].includes(String(services[key])))
    && typeof roles.mother === "boolean" && typeof roles.father === "boolean";
}

function stateText(key: keyof StatusPayload["services"], state: ServiceState): string {
  if (state === "ready") return "Sẵn sàng";
  if (state === "setup") return key === "notifications" ? "Thông báo cần thiết lập" : "Cần thiết lập";
  if (state === "limited") return key === "journal" ? "Nhật ký đang cập nhật chậm" : "Đang chậm";
  return key === "assistant" ? "Trợ lý đang nghỉ" : "Đang nghỉ";
}

export default function SystemStatus() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const refresh = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      const payload: unknown = response.ok ? await response.json() : null;
      if (!validPayload(payload)) throw new Error("invalid status");
      setStatus(payload);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return <section className="section system-status" aria-labelledby="system-status-title">
    <div className="system-status-head">
      <div><p className="panel-kicker">Một nơi để kiểm tra</p><h2 id="system-status-title">Tình trạng EmBe</h2></div>
      <button aria-label="Kiểm tra lại tình trạng EmBe" disabled={state === "loading"} onClick={() => void refresh()} type="button">
        {state === "loading" ? "Đang xem…" : "Kiểm tra lại"}
      </button>
    </div>
    {state === "error" && !status ? <p className="system-status-error" role="status">Chưa kiểm tra được lúc này</p> : null}
    {status ? <>
      <ul className="system-status-list">
        {serviceNames.map(([key, name]) => <li data-state={status.services[key]} key={key}>
          <span aria-hidden="true" /><strong>{name}</strong><small>{stateText(key, status.services[key])}</small>
        </li>)}
      </ul>
      <p className="system-status-family">
        {`Mẹ Ngân ${status.notificationRoles.mother ? "đã bật" : "chưa bật"} · Ba Hiếu ${status.notificationRoles.father ? "đã bật" : "chưa bật"}`}
      </p>
      {!status.notificationRoles.mother || !status.notificationRoles.father
        ? <Link className="system-status-setup-link" href="/cai-dat#thiet-lap-dien-thoai">Thiết lập điện thoại còn lại</Link>
        : null}
    </> : state === "loading" ? <p className="system-status-loading" role="status">Đang kiểm tra các phần quan trọng…</p> : null}
  </section>;
}
