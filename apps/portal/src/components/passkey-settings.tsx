"use client";

import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { useEffect, useState } from "react";

type PasskeyDevice = {
  credentialId: string;
  label: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  backedUp: boolean;
};

export default function PasskeySettings() {
  const [supported, setSupported] = useState(false);
  const [devices, setDevices] = useState<PasskeyDevice[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function loadDevices() {
    try {
      const response = await fetch("/api/auth/passkey/devices", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { devices?: PasskeyDevice[] };
      setDevices(Array.isArray(data.devices) ? data.devices : []);
    } catch {
      // Settings remain usable offline; retry occurs on the next visit/action.
    }
  }

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    void loadDevices();
  }, []);

  async function register() {
    setBusy(true);
    setMessage("");
    try {
      const optionResponse = await fetch("/api/auth/passkey/options", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose: "register" })
      });
      if (!optionResponse.ok) throw new Error("options");
      const optionsJSON = await optionResponse.json() as PublicKeyCredentialCreationOptionsJSON;
      const credential = await startRegistration({ optionsJSON });
      const role = localStorage.getItem("embe:device-role");
      const label = role === "father" ? "iPhone của Ba Hiếu" : "iPhone của Mẹ Ngân";
      const verification = await fetch("/api/auth/passkey/verify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose: "register", label, response: credential })
      });
      if (!verification.ok) throw new Error("verify");
      setMessage("Đã thêm Face ID cho điện thoại này.");
      await loadDevices();
    } catch {
      setMessage("Chưa thêm được Face ID. Mở EmBe bằng Safari rồi thử lại.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(device: PasskeyDevice) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/passkey/devices", {
        method: "DELETE", headers: { "content-type": "application/json" },
        body: JSON.stringify({ credentialId: device.credentialId })
      });
      if (!response.ok) throw new Error("remove");
      setDevices((current) => current.filter((item) => item.credentialId !== device.credentialId));
      setMessage("Đã gỡ Face ID khỏi danh sách đăng nhập.");
    } catch {
      setMessage("Chưa gỡ được. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section passkey-settings" aria-labelledby="passkey-settings-title">
      <div className="section-head">
        <p className="panel-kicker">Đăng nhập nhanh và riêng tư</p>
        <h2 id="passkey-settings-title">Face ID trên iPhone</h2>
      </div>
      <p>Passkey nằm trong iCloud Keychain; EmBe chỉ giữ khóa công khai để xác nhận.</p>
      {supported ? (
        <button className="btn btn-secondary" disabled={busy} onClick={register} type="button">
          {busy ? "Đang xử lý…" : "Thêm Face ID cho máy này"}
        </button>
      ) : <p>Trình duyệt này chưa hỗ trợ passkey. Hãy mở EmBe bằng Safari mới nhất.</p>}
      {devices.length ? (
        <ul className="passkey-device-list">
          {devices.map((device) => (
            <li key={device.credentialId}>
              <span><strong>{device.label}</strong><small>{device.lastUsedAt ? "Đã dùng gần đây" : "Chưa dùng để đăng nhập"}</small></span>
              <button aria-label={`Gỡ ${device.label}`} disabled={busy} onClick={() => remove(device)} type="button">Gỡ</button>
            </li>
          ))}
        </ul>
      ) : <p className="settings-saved">Chưa thêm Face ID.</p>}
      {message ? <p className="settings-saved" role="status">{message}</p> : null}
    </section>
  );
}
