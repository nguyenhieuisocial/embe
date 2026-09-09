export type FamilyDestinationHref = "/" | "/me-bau" | "/me" | "/be" | "/ky-niem" | "/nha-minh";

export type PageContext = {
  parentHref: string;
  parentLabel: string;
  title: string;
};

type PageGroup = "maternal" | "baby" | "memories" | "family" | "studio";

type PageDefinition = {
  group: PageGroup;
  title: string;
};

// Existing URLs remain the source of truth. These labels only organize the
// interface; this catalog never redirects or changes stored deep links.
const pages: Readonly<Record<string, PageDefinition>> = {
  "/me-bau/bua-an": { group: "maternal", title: "Bữa ăn" },
  "/me-bau/suc-khoe": { group: "maternal", title: "Sức khỏe của Mẹ" },
  "/me-bau/suc-khoe-iphone": { group: "maternal", title: "Sức khỏe từ iPhone" },
  "/me-bau/thuoc": { group: "maternal", title: "Thuốc & vi chất" },
  "/me-bau/ho-so": { group: "maternal", title: "Hồ sơ thai kỳ" },
  "/me-bau/tuan-nay": { group: "maternal", title: "Tuần này" },
  "/me-bau/tam-trang": { group: "maternal", title: "Tâm trạng" },
  "/me-bau/trieu-chung": { group: "maternal", title: "Triệu chứng & tâm trạng" },
  "/me-bau/thai-may": { group: "maternal", title: "Ghi nhịp thai máy" },
  "/me-bau/thu-gian": { group: "maternal", title: "Thư giãn" },
  "/me-bau/meo-dan-gian": { group: "maternal", title: "Mẹo & dân gian" },
  "/chuan-bi-sinh": { group: "maternal", title: "Chuẩn bị sinh" },
  "/be/ho-so": { group: "baby", title: "Hồ sơ của Bé" },
  "/be/phat-trien": { group: "baby", title: "Tăng trưởng & cột mốc" },
  "/ky-niem/thai-ky": { group: "memories", title: "Kỷ niệm thai kỳ" },
  "/nhat-ky": { group: "memories", title: "Nhật ký" },
  "/ghi-lai": { group: "memories", title: "Ghi nhật ký" },
  "/nha-minh/ho-so": { group: "family", title: "Hồ sơ sức khỏe gia đình" },
  "/lich": { group: "family", title: "Lịch gia đình" },
  "/ke-hoach": { group: "family", title: "Kế hoạch" },
  "/do-dung": { group: "family", title: "Đồ dùng" },
  "/ngan-sach": { group: "family", title: "Ngân sách" },
  "/tro-ly": { group: "family", title: "Trợ lý EmBe" },
  "/so-me-va-be": { group: "family", title: "Sổ Mẹ & Bé" },
  "/tim-kiem": { group: "family", title: "Tìm trong EmBe" },
  "/cai-dat": { group: "family", title: "Cài đặt" },
  "/huong-dan": { group: "family", title: "Hướng dẫn" },
  "/studio": { group: "family", title: "Studio" },
  "/studio/ban-lam-viec": { group: "studio", title: "Bản nháp" },
  "/studio/soan": { group: "studio", title: "Soạn video" },
  "/studio/duyet-dang": { group: "studio", title: "Duyệt & đăng" },
  "/studio/kham-pha": { group: "studio", title: "Khám phá chủ đề" },
  "/studio/nghien-cuu": { group: "studio", title: "Nghiên cứu" }
};

const hubPaths = new Set(["/", "/me-bau", "/me", "/be", "/ky-niem", "/nha-minh"]);

function cleanPath(pathname: string): string {
  return pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
}

function belongsTo(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

/** The one visible bottom tab that owns this page at the current life stage. */
export function getFamilyDestination(pathname: string, postpartum: boolean): FamilyDestinationHref {
  const path = cleanPath(pathname);
  if (path === "/") return "/";
  if (belongsTo(path, "/me-bau") || belongsTo(path, "/me") || belongsTo(path, "/chuan-bi-sinh")) {
    return postpartum ? "/me" : "/me-bau";
  }
  if (belongsTo(path, "/be")) return postpartum ? "/be" : "/nha-minh";
  if (belongsTo(path, "/ky-niem") || belongsTo(path, "/nhat-ky") || belongsTo(path, "/ghi-lai")) {
    return postpartum ? "/nha-minh" : "/ky-niem";
  }
  return "/nha-minh";
}

function parentFor(group: PageGroup, postpartum: boolean): Pick<PageContext, "parentHref" | "parentLabel"> {
  switch (group) {
    case "maternal": return { parentHref: postpartum ? "/me" : "/me-bau", parentLabel: postpartum ? "Mẹ" : "Mẹ bầu" };
    case "baby": return { parentHref: "/be", parentLabel: "Bé" };
    case "memories": return { parentHref: "/ky-niem", parentLabel: "Kỷ niệm" };
    case "studio": return { parentHref: "/studio", parentLabel: "Studio" };
    case "family": return { parentHref: "/nha-minh", parentLabel: "Nhà mình" };
  }
}

/** A stable destination, not history.back(), so a shared deep link has a way out. */
export function getPageContext(pathname: string, postpartum: boolean): PageContext | null {
  const path = cleanPath(pathname);
  if (hubPaths.has(path)
    || belongsTo(path, "/login") || belongsTo(path, "/offline")
    || belongsTo(path, "/in-anh") || belongsTo(path, "/chia-se")) return null;

  if (path === '/cap-nhat') return {parentHref:'/cai-dat',parentLabel:'Cài đặt',title:'Cập nhật EmBe'};

  if (path.startsWith("/me-bau/ho-so/tai-lieu/")) {
    return { parentHref: "/me-bau/ho-so", parentLabel: "Hồ sơ thai kỳ", title: "Giấy tờ khám" };
  }
  const page = pages[path];
  if (page) return { ...parentFor(page.group, postpartum), title: page.title };
  if (path.startsWith("/studio/")) {
    return { parentHref: "/studio", parentLabel: "Studio", title: "Kịch bản & video" };
  }
  // Unknown routes should not acquire an invented title or parent.
  return null;
}
