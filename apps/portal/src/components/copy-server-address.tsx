"use client";

import { useState } from "react";

type CopyState = "idle" | "copied" | "error";

export default function CopyServerAddress({ address }: { address: string }) {
  const [state, setState] = useState<CopyState>("idle");

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setState("copied");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="immich-server-card">
      <code>{address}</code>
      <div>
        <a href={address}>Mở Immich gia đình</a>
        <button type="button" onClick={copyAddress}>Sao chép địa chỉ Immich</button>
      </div>
      {state === "copied" ? <small role="status">Đã sao chép</small> : null}
      {state === "error" ? <small role="alert">Chưa sao chép được — hãy chạm giữ địa chỉ ở trên.</small> : null}
    </div>
  );
}
