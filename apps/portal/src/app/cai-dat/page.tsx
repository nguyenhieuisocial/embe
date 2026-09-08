import Link from "next/link";

import AdvancedDeviceSettings from "../../components/advanced-device-settings";
import AppHeader from "../../components/app-header";
import BirthTransition from "../../components/birth-transition";
import DeviceSetup from "../../components/device-setup";
import FamilyProfile from "../../components/family-profile";
import FamilyDataExport from "../../components/family-data-export";
import FamilyTrash from "../../components/family-trash";
import PasskeySettings from "../../components/passkey-settings";
import SessionSettings from "../../components/session-settings";
import { Icon } from "../../components/embe-icon";

export default function SettingsPage() {
  return (
    <main className="page settings-main">
      <AppHeader note="Thiết lập riêng" />

      <section className="settings-hero">
        <h1>Cài đặt</h1>
        <p className="intro">Điện thoại của bạn, thông tin của hai mình.</p>
      </section>

      <DeviceSetup />
      <Link className="btn btn-quiet btn-block" href="/cap-nhat">Có gì mới · Chi tiết các bản cập nhật</Link>
      <FamilyProfile />
      <PasskeySettings />
      <details className="settings-group">
        <summary><Icon name="settings" /><span><strong>Giao diện & thao tác</strong><small>Cỡ chữ, độ gọn và chuyển động</small></span><Icon name="arrow" /></summary>
        <AdvancedDeviceSettings />
      </details>
      <details className="settings-group">
        <summary><Icon name="settings" /><span><strong>Thiết bị đăng nhập</strong><small>Xem các phiên và đăng xuất</small></span><Icon name="arrow" /></summary>
        <SessionSettings />
      </details>
      <details className="settings-group">
        <summary><Icon name="guide" /><span><strong>Dữ liệu & khôi phục</strong><small>Xuất dữ liệu, lấy lại mục đã xóa</small></span><Icon name="arrow" /></summary>
        <FamilyDataExport />
        <FamilyTrash />
      </details>

      <section className="section settings-family" aria-labelledby="settings-family-title">
        <div className="section-head">
          <p className="panel-kicker">Dùng chung cho Hiếu &amp; Ngân</p>
          <h2 id="settings-family-title">Thai kỳ và sức khỏe</h2>
        </div>
        <Link href="/me-bau#cai-dat-giai-doan">Mở cài đặt giai đoạn thai kỳ <Icon name="arrow" /></Link>
        <Link href="/me-bau/suc-khoe">Mở theo dõi sức khỏe và mục tiêu bác sĩ <Icon name="arrow" /></Link>
        <BirthTransition manual />
        <p>EmBe không tự đặt mục tiêu thuốc, vitamin hay tăng cân. Chỉ lưu số gia đình nhập theo hướng dẫn của bác sĩ.</p>
      </section>
    </main>
  );
}
