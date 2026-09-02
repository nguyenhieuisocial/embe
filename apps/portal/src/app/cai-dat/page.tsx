import AdvancedDeviceSettings from "../../components/advanced-device-settings";
import AppHeader from "../../components/app-header";
import DeviceSetup from "../../components/device-setup";
import FamilyProfile from "../../components/family-profile";
import PasskeySettings from "../../components/passkey-settings";
import { Icon } from "../../components/embe-icon";

export default function SettingsPage() {
  return (
    <main className="page settings-main">
      <AppHeader note="Thiết lập riêng" />

      <section className="settings-hero">
        <p className="eyebrow">Nhà mình dùng theo cách riêng</p>
        <h1>Cài đặt</h1>
        <p className="intro">Tùy chỉnh điện thoại này và thông tin dùng chung của gia đình.</p>
      </section>

      <DeviceSetup />
      <PasskeySettings />
      <AdvancedDeviceSettings />
      <FamilyProfile />

      <section className="section settings-family" aria-labelledby="settings-family-title">
        <div className="section-head">
          <p className="panel-kicker">Dùng chung cho Hiếu &amp; Ngân</p>
          <h2 id="settings-family-title">Thai kỳ và sức khỏe</h2>
        </div>
        <a href="/me-bau#cai-dat-giai-doan">Mở cài đặt giai đoạn thai kỳ <Icon name="arrow" /></a>
        <a href="/me-bau#suc-khoe">Mở theo dõi sức khỏe và mục tiêu bác sĩ <Icon name="arrow" /></a>
        <p>EmBe không tự đặt mục tiêu thuốc, vitamin hay tăng cân. Chỉ lưu số gia đình nhập theo hướng dẫn của bác sĩ.</p>
      </section>
    </main>
  );
}
