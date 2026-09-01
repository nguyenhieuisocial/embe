"use client";

import { useEffect, useState } from "react";

import { readDeviceRole, saveDeviceRole, type DeviceRole } from "../lib/device-preferences";

const labels: Record<DeviceRole, string> = { mother: "Mẹ Ngân", father: "Ba Hiếu" };

export default function DeviceSetup() {
  const [role, setRole] = useState<DeviceRole | null>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setRole(readDeviceRole(localStorage));
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
    setStandalone(Boolean(navigatorWithStandalone.standalone || window.matchMedia?.("(display-mode: standalone)").matches));
  }, []);

  function choose(next: DeviceRole) {
    saveDeviceRole(localStorage, next);
    setRole(next);
  }

  return (
    <section className="section device-setup" aria-labelledby="device-setup-title">
      <div className="section-head">
        <p className="panel-kicker">Thiết lập điện thoại này</p>
        <h2 id="device-setup-title">EmBe nhớ người đang dùng</h2>
      </div>
      <p>Chọn một lần để ảnh, nhật ký và phản hồi tự điền đúng tên.</p>
      <div className="device-role-choice">
        <button aria-pressed={role === "mother"} onClick={() => choose("mother")} type="button">Điện thoại của Mẹ Ngân</button>
        <button aria-pressed={role === "father"} onClick={() => choose("father")} type="button">Điện thoại của Ba Hiếu</button>
      </div>
      {role ? <p className="device-setup-state" role="status"><span aria-hidden="true">✓</span> Đã nhớ đây là điện thoại của {labels[role]}.</p> : <p className="device-setup-state is-wait">Chưa chọn người dùng cho điện thoại này.</p>}
      <div className="device-setup-links">
        <a href="/me-bau#cai-dat-giai-doan">Kiểm tra ngày dự sinh</a>
        <a href="/huong-dan#iphone-title">{standalone ? "Xem hướng dẫn kết nối ảnh" : "Thêm EmBe vào màn hình chính"}</a>
      </div>
    </section>
  );
}
