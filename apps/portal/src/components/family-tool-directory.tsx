"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "./embe-icon";

type Tool = { href: string; title: string; detail: string; icon: IconName; keywords?: string };
export const familyToolGroups: Array<{ title: string; detail: string; tools: Tool[] }> = [
  { title: "Lịch & việc chung", detail: "Hẹn khám, kế hoạch, đồ dùng, chi tiêu", tools: [
    { href: "/lich", title: "Lịch gia đình", detail: "Lịch âm, ngày hẹn và kỷ niệm", icon: "calendar" },
    { href: "/ke-hoach", title: "Kế hoạch & việc cần làm", detail: "Việc của Mẹ, Ba và cả nhà", icon: "check", keywords: "todo checklist" },
    { href: "/do-dung", title: "Đồ dùng", detail: "Chuẩn bị, số lượng và món sắp hết", icon: "supply" },
    { href: "/ngan-sach", title: "Ngân sách & chi tiêu", detail: "Dự tính và các khoản đã chi", icon: "album" }
  ] },
  { title: "Sức khỏe cả nhà", detail: "Hồ sơ của Mẹ, Ba và các con", tools: [
    { href: "/nha-minh/ho-so", title: "Hồ sơ từng người", detail: "Thông tin cá nhân và chỉ số sức khỏe", icon: "care" },
    { href: "/nha-minh/ho-so?tab=records", title: "Bệnh án & xét nghiệm", detail: "Giấy tờ sức khỏe ngoài thai kỳ", icon: "album" },
    { href: "/me-bau/ho-so", title: "Hồ sơ & lịch khám thai", detail: "Siêu âm, đơn thuốc, phiếu thu", icon: "calendar" },
    { href: "/me-bau/suc-khoe-iphone#suc-khoe-iphone", title: "Sức khỏe từ iPhone", detail: "Kết nối, nhập dữ liệu Apple Health", icon: "refresh", keywords: "đồng bộ phím tắt shortcut" },
    { href: "/tro-ly", title: "Trợ lý gia đình", detail: "Hỏi và xem lại dữ liệu đã ghi", icon: "assistant", keywords: "AI chat ghi âm" }
  ] },
  { title: "Chăm Mẹ theo giai đoạn", detail: "Ăn uống, sức khỏe và chuẩn bị sinh", tools: [
    { href: "/me-bau", title: "Mẹ bầu hôm nay", detail: "Tuần thai và checklist mỗi ngày", icon: "care" },
    { href: "/me-bau/bua-an", title: "Bữa ăn & dinh dưỡng", detail: "Chụp món, ghi bữa ăn, xem gợi ý", icon: "meal", keywords: "calo kcal thực đơn" },
    { href: "/me-bau/suc-khoe", title: "Số đo sức khỏe", detail: "Cân nặng, huyết áp, ngủ và nước", icon: "care" },
    { href: "/me-bau/thuoc", title: "Thuốc & vi chất", detail: "Theo đơn, tự mua và lịch uống", icon: "check", keywords: "vitamin khoáng chất bổ sung sắt canxi DHA" },
    { href: "/me-bau/tam-trang", title: "Tâm trạng", detail: "Ghi cảm xúc và điều Mẹ cần", icon: "care" },
    { href: "/me-bau/trieu-chung", title: "Triệu chứng", detail: "Ghi lại thay đổi của cơ thể", icon: "write" },
    { href: "/me-bau/tuan-nay", title: "Tuần này của Mẹ & Bé", detail: "Hành trình và mốc thai kỳ", icon: "calendar" },
    { href: "/me-bau/thai-may", title: "Đếm cử động thai", detail: "Công cụ theo dõi thai máy", icon: "care", keywords: "kick counter" },
    { href: "/chuan-bi-sinh", title: "Chuẩn bị sinh", detail: "Kế hoạch sinh, giỏ đồ và cơn gò", icon: "supply", keywords: "co thắt" },
    { href: "/me", title: "Mẹ sau sinh", detail: "Phục hồi theo giai đoạn", icon: "care" },
    { href: "/be", title: "Chăm Bé", detail: "Bú, ngủ, tã và nhiệt độ", icon: "milk" },
    { href: "/be/ho-so", title: "Hồ sơ của Bé", detail: "Lịch khám, tiêm và sức khỏe", icon: "album" },
    { href: "/be/phat-trien", title: "Bé lớn từng ngày", detail: "Tăng trưởng và mốc phát triển", icon: "thread" }
  ] },
  { title: "Ảnh, nhật ký & bản in", detail: "Lưu và tìm lại những ngày của gia đình", tools: [
    { href: "/ky-niem", title: "Kỷ niệm", detail: "Album, ngày tháng, chuyến đi, bản đồ", icon: "memory" },
    { href: "/nhat-ky", title: "Nhật ký", detail: "Xem lại những điều đã ghi", icon: "write" },
    { href: "/ghi-lai", title: "Viết nhật ký", detail: "Ghi chú, ảnh và check-in", icon: "plus" },
    { href: "/ky-niem/thai-ky", title: "Ảnh thai kỳ", detail: "Bụng bầu theo tuần và thiệp cột mốc", icon: "memory" },
    { href: "/so-me-va-be", title: "Sổ Mẹ & Bé", detail: "Xuất PDF, chia sẻ hoặc in", icon: "guide" },
    { href: "/tim-kiem", title: "Tìm trong ký ức", detail: "Tìm ảnh, chuyến đi và nhật ký", icon: "album" }
  ] },
  { title: "Tra cứu & thư giãn", detail: "Kiến thức để mở khi cần", tools: [
    { href: "/me-bau#cam-nang", title: "Cẩm nang thai kỳ", detail: "Ăn uống, vận động và lưu ý an toàn", icon: "guide", keywords: "thực phẩm nên kiêng" },
    { href: "/me-bau/meo-dan-gian", title: "Mẹo & dân gian", detail: "Phân biệt kinh nghiệm và bằng chứng", icon: "guide" },
    { href: "/me-bau/thu-gian", title: "Thư giãn", detail: "Khoảng nghỉ và hít thở nhẹ nhàng", icon: "sleep" }
  ] },
  { title: "Cài đặt & kết nối", detail: "Điện thoại, thông báo và quyền riêng tư", tools: [
    { href: "/cai-dat", title: "Cài đặt", detail: "Tùy chỉnh, thông báo, thiết bị và dữ liệu", icon: "settings", keywords: "passkey mật khẩu xuất khôi phục xóa" },
    { href: "/huong-dan", title: "Hướng dẫn sử dụng", detail: "Cài EmBe, kết nối Immich trên iPhone", icon: "guide", keywords: "PWA tailscale" },
    { href: "/nha-minh#trang-thai", title: "Trạng thái & cập nhật", detail: "Kết nối, đồng bộ và tải bản mới", icon: "refresh" }
  ] },
  { title: "Studio sáng tạo", detail: "Không gian làm nội dung EmBe riêng", tools: [
    { href: "/studio", title: "Studio · video & tự động", detail: "Xem video và tiến độ thực tế", icon: "write" },
    { href: "/studio/ban-lam-viec", title: "Bản nháp", detail: "Các dự án đang làm", icon: "album" },
    { href: "/studio/soan", title: "Soạn video", detail: "Kịch bản, giọng đọc và phụ đề", icon: "plus" },
    { href: "/studio/duyet-dang", title: "Duyệt & đăng", detail: "Kiểm tra hàng chờ và kết nối đăng", icon: "check" },
    { href: "/studio/kham-pha", title: "Khám phá chủ đề", detail: "Lưu nguồn và ý tưởng nội dung", icon: "guide" },
    { href: "/studio/nghien-cuu", title: "Nghiên cứu nội dung", detail: "Nguồn tham khảo và định hướng", icon: "album" }
  ] }
];

export function normalizeToolQuery(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
}

export default function FamilyToolDirectory() {
  const [query, setQuery] = useState("");
  useEffect(() => {
    const revealStatus = () => {
      if (window.location.hash === "#trang-thai") document.getElementById("trang-thai")?.setAttribute("open", "");
    };
    revealStatus();
    window.addEventListener("hashchange", revealStatus);
    return () => window.removeEventListener("hashchange", revealStatus);
  }, []);
  const normalized = normalizeToolQuery(query);
  const terms = normalized.split(/\s+/).filter(Boolean);
  const groups = familyToolGroups.map(group => ({ ...group, tools: group.tools.filter(tool => {
    const text = normalizeToolQuery(`${tool.title} ${tool.detail} ${tool.keywords ?? ""}`);
    return terms.every(term => text.includes(term));
  }) })).filter(group => group.tools.length);
  const count = groups.reduce((sum, group) => sum + group.tools.length, 0);

  return <section className="tool-directory" id="cong-cu" aria-label="Công cụ của nhà mình">
    <label className="tool-search">
      <span>Tìm công cụ</span>
      <div><input type="search" placeholder="Thuốc, lịch khám, ảnh, PDF…" value={query} onChange={e => setQuery(e.target.value)} />
        {query && <button type="button" aria-label="Xóa tìm kiếm công cụ" onClick={() => setQuery("")}><Icon name="close" /></button>}</div>
    </label>
    {normalized && <p className="tool-search-count" role="status">{count ? `${count} công cụ phù hợp` : "Chưa tìm thấy. Thử tên ngắn hơn, như “thuốc” hoặc “ảnh”."}</p>}
    {groups.map(group => <details className="tool-group" key={`${group.title}:${normalized}`} open={normalized ? true : undefined}>
      <summary><span><strong>{group.title}</strong><small>{group.detail}</small></span><Icon name="arrow" /></summary>
      <nav aria-label={group.title}>
        {group.tools.map(tool => <Link className="tool-row" href={tool.href} key={tool.href} prefetch={false} onClick={() => {
          if (tool.href === "/nha-minh#trang-thai") document.getElementById("trang-thai")?.setAttribute("open", "");
        }}>
          <Icon name={tool.icon} /><span><strong>{tool.title}</strong><small>{tool.detail}</small></span><Icon name="arrow" />
        </Link>)}
      </nav>
    </details>)}
  </section>;
}
