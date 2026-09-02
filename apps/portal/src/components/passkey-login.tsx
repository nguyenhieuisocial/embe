"use client";

import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { useEffect, useState } from "react";

export default function PasskeyLogin({ destination }: { destination: string }) {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => setSupported(browserSupportsWebAuthn()), []);
  if (!supported) return null;

  async function login() {
    setBusy(true);
    setMessage("");
    try {
      const optionResponse = await fetch("/api/auth/passkey/options", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose: "login" })
      });
      if (optionResponse.status === 404) {
        setMessage("Chưa có Face ID nào được thêm. Vào bằng mật khẩu rồi mở Cài đặt để thêm.");
        return;
      }
      if (!optionResponse.ok) throw new Error("options");
      const optionsJSON = await optionResponse.json() as PublicKeyCredentialRequestOptionsJSON;
      const credential = await startAuthentication({ optionsJSON });
      const verification = await fetch("/api/auth/passkey/verify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose: "login", response: credential })
      });
      if (!verification.ok) throw new Error("verify");
      window.location.assign(destination.startsWith("/") && !destination.startsWith("//") ? destination : "/");
    } catch {
      setMessage("Face ID chưa xác nhận. Mẹ có thể thử lại hoặc dùng mật khẩu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="passkey-login">
      <span aria-hidden="true">hoặc</span>
      <button className="btn btn-secondary btn-block" disabled={busy} onClick={login} type="button">
        {busy ? "Đang mở Face ID…" : "Vào bằng Face ID"}
      </button>
      {message ? <p className="login-error" role="status">{message}</p> : null}
    </div>
  );
}

