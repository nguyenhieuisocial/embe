"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_DEVICE_SETTINGS,
  readDeviceSettings,
  saveDeviceSettings,
  type DeviceSettings
} from "../lib/device-preferences";

export default function AdvancedDeviceSettings() {
  const [settings, setSettings] = useState<DeviceSettings>(DEFAULT_DEVICE_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => setSettings(readDeviceSettings(localStorage)), []);

  function update(next: Partial<DeviceSettings>) {
    const value = { ...settings, ...next };
    setSettings(value);
    saveDeviceSettings(localStorage, value);
    setSaved(true);
  }

  function reset() {
    setSettings(DEFAULT_DEVICE_SETTINGS);
    saveDeviceSettings(localStorage, DEFAULT_DEVICE_SETTINGS);
    setSaved(true);
  }

  return (
    <section className="section advanced-settings" aria-labelledby="advanced-settings-title">
      <div className="section-head">
        <p className="panel-kicker">Riêng cho điện thoại này</p>
        <h2 id="advanced-settings-title">Hiển thị trên điện thoại này</h2>
      </div>

      <div className="settings-row">
        <span><strong>Độ gọn</strong><small>Chọn lượng khoảng trống giữa các phần.</small></span>
        <div className="settings-segment" aria-label="Độ gọn">
          <button type="button" aria-pressed={settings.density === "comfortable"} onClick={() => update({ density: "comfortable" })}>Thoáng</button>
          <button type="button" aria-pressed={settings.density === "compact"} onClick={() => update({ density: "compact" })}>Gọn</button>
        </div>
      </div>

      <div className="settings-row">
        <span><strong>Cỡ chữ</strong><small>Tăng chữ mà không phóng to cả màn hình.</small></span>
        <div className="settings-segment" aria-label="Cỡ chữ">
          <button type="button" aria-pressed={settings.textSize === "standard"} onClick={() => update({ textSize: "standard" })}>Vừa</button>
          <button type="button" aria-pressed={settings.textSize === "large"} onClick={() => update({ textSize: "large" })}>Chữ lớn</button>
        </div>
      </div>

      <label className="settings-toggle">
        <span><strong>Giảm chuyển động</strong><small>Tắt hiệu ứng chuyển trang và chuyển động không cần thiết.</small></span>
        <input aria-label="Giảm chuyển động" type="checkbox" role="switch" checked={settings.motion === "reduced"} onChange={(event) => update({ motion: event.target.checked ? "reduced" : "system" })} />
      </label>

      <label className="settings-toggle">
        <span><strong>Che nội dung khi rời EmBe</strong><small>Giảm nguy cơ lộ sức khỏe và ảnh trong màn hình đa nhiệm.</small></span>
        <input aria-label="Che nội dung khi rời EmBe" type="checkbox" role="switch" checked={settings.privacyShield} onChange={(event) => update({ privacyShield: event.target.checked })} />
      </label>

      <button className="settings-reset" type="button" onClick={reset}>Đặt lại hiển thị</button>
      {saved ? <p className="settings-saved" role="status">Đã lưu trên điện thoại này.</p> : null}
    </section>
  );
}
