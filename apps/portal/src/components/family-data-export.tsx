"use client";

import { useState } from "react";

export default function FamilyDataExport() {
  const [status, setStatus] = useState<"idle" | "working" | "success" | "error">("idle");

  async function download(): Promise<void> {
    if (!window.confirm("Bản JSON chứa dữ liệu sức khỏe riêng tư của gia đình. Chỉ lưu trên thiết bị tin cậy và không chia sẻ công khai. Bạn muốn tiếp tục?")) return;
    setStatus("working");
    try {
      const response = await fetch("/api/family/export", { method: "POST" });
      if (!response.ok) throw new Error("export unavailable");
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? "embe-family-data.json";
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 0);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  return <section className="section settings-family" aria-labelledby="family-data-export-title">
    <div className="section-head">
      <p className="panel-kicker">Bản mang theo được</p>
      <h2 id="family-data-export-title">Dữ liệu của gia đình</h2>
    </div>
    <p>Tải một gói JSON có phiên bản gồm dữ liệu gia đình đang lưu trong EmBe. Gói này không gồm file ảnh, video hay tài liệu gốc, và không chứa khóa bí mật.</p>
      <p>Gói gồm cả nhật ký đang thấy trong EmBe, ghi chép đang chờ đồng bộ, lịch sử xóa, khôi phục và hoạt động gần đây.</p>
    <button className="btn btn-primary btn-block" type="button" disabled={status === "working"} onClick={() => void download()}>
      {status === "working" ? "Đang chuẩn bị…" : "Xuất dữ liệu JSON"}
    </button>
    <p className="state-note" role={status === "error" ? "alert" : "status"} aria-live="polite">
      {status === "success" ? "Đã tạo bản tải xuống trên thiết bị này." : null}
      {status === "error" ? "Chưa xuất được dữ liệu. Hãy thử lại khi có mạng." : null}
    </p>
  </section>;
}
