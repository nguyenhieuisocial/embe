import { describe, expect, it } from "vitest";

import { getFamilyDestination, getPageContext } from "../src/lib/app-navigation";

describe("family route ownership", () => {
  it.each([
    ["/", "/", "/"],
    ["/me-bau", "/me-bau", "/me"],
    ["/me", "/me-bau", "/me"],
    ["/me-bau/bua-an", "/me-bau", "/me"],
    ["/me-bau/ho-so/tai-lieu/document-id", "/me-bau", "/me"],
    ["/chuan-bi-sinh", "/me-bau", "/me"],
    ["/be", "/nha-minh", "/be"],
    ["/be/ho-so", "/nha-minh", "/be"],
    ["/be/phat-trien", "/nha-minh", "/be"],
    ["/ky-niem", "/ky-niem", "/nha-minh"],
    ["/ky-niem/thai-ky", "/ky-niem", "/nha-minh"],
    ["/ky-niem/album/album-id", "/ky-niem", "/nha-minh"],
    ["/nhat-ky", "/ky-niem", "/nha-minh"],
    ["/nhat-ky/entry-id", "/ky-niem", "/nha-minh"],
    ["/ghi-lai", "/ky-niem", "/nha-minh"],
    ["/nha-minh/ho-so", "/nha-minh", "/nha-minh"],
    ["/studio", "/nha-minh", "/nha-minh"],
    ["/studio/soan", "/nha-minh", "/nha-minh"],
    ["/studio/ca-phe", "/nha-minh", "/nha-minh"],
    ["/cai-dat", "/nha-minh", "/nha-minh"],
    ["/ke-hoach", "/nha-minh", "/nha-minh"]
  ])("owns %s in both life stages", (path, pregnancyOwner, postpartumOwner) => {
    expect(getFamilyDestination(path, false)).toBe(pregnancyOwner);
    expect(getFamilyDestination(path, true)).toBe(postpartumOwner);
  });

  it.each(["/me-bau-cu", "/be-cu", "/ky-niem-cu", "/nhat-ky-cu", "/ghi-lai-cu", "/other"]) (
    "matches a complete route segment, not %s", path => {
      expect(getFamilyDestination(path, false)).toBe("/nha-minh");
      expect(getFamilyDestination(path, true)).toBe("/nha-minh");
    }
  );

  it("preserves ownership of query, anchor and trailing-slash deep links", () => {
    expect(getFamilyDestination("/ky-niem/?view=album#gui-anh", false)).toBe("/ky-niem");
    expect(getFamilyDestination("/ky-niem/thai-ky/?week=12", true)).toBe("/nha-minh");
    expect(getPageContext("/me-bau/suc-khoe-iphone?quick=self-purchased#vi-chat-thuoc", false)?.parentHref).toBe("/me-bau");
  });
});

describe("page context", () => {
  it.each(["/", "/me-bau", "/ky-niem", "/nha-minh", "/me", "/be", "/login", "/offline", "/in-anh/photo-id", "/chia-se/token"]) (
    "keeps hub and focused bare page %s free of duplicate context", path => {
      expect(getPageContext(path, false)).toBeNull();
      expect(getPageContext(path, true)).toBeNull();
    }
  );

  it("keeps the maternal child contextual when the mother moves to postpartum", () => {
    expect(getPageContext("/me-bau/bua-an", false)).toEqual({ parentHref: "/me-bau", parentLabel: "Mẹ bầu", title: "Bữa ăn" });
    expect(getPageContext("/me-bau/bua-an", true)).toEqual({ parentHref: "/me", parentLabel: "Mẹ", title: "Bữa ăn" });
    expect(getPageContext("/chuan-bi-sinh", true)?.parentHref).toBe("/me");
  });

  it("gives medical files a way back to records, not the maternal root", () => {
    expect(getPageContext("/me-bau/ho-so/tai-lieu/record-id", false)).toEqual({
      parentHref: "/me-bau/ho-so", parentLabel: "Hồ sơ thai kỳ", title: "Giấy tờ khám"
    });
  });

  it.each([
    ["/me-bau/suc-khoe", "Sức khỏe của Mẹ"],
    ["/me-bau/suc-khoe-iphone", "Sức khỏe từ iPhone"],
    ["/me-bau/thuoc", "Thuốc & vi chất"],
    ["/me-bau/ho-so", "Hồ sơ thai kỳ"],
    ["/me-bau/tuan-nay", "Tuần này"],
    ["/me-bau/tam-trang", "Tâm trạng"],
    ["/me-bau/trieu-chung", "Triệu chứng & tâm trạng"],
    ["/me-bau/thai-may", "Ghi nhịp thai máy"],
    ["/me-bau/thu-gian", "Thư giãn"],
    ["/me-bau/meo-dan-gian", "Mẹo & dân gian"]
  ])("labels maternal tool %s without renaming the route", (path, title) => {
    expect(getPageContext(path, false)).toEqual({ parentHref: "/me-bau", parentLabel: "Mẹ bầu", title });
  });

  it.each(["/studio/ban-lam-viec", "/studio/soan", "/studio/duyet-dang", "/studio/kham-pha", "/studio/nghien-cuu", "/studio/ca-phe", "/studio/soan/project-id"]) (
    "keeps Studio child %s inside its own workspace", path => {
      const context = getPageContext(path, false);
      expect(context?.parentHref).toBe("/studio");
      expect(context?.parentLabel).toBe("Studio");
      expect(context?.title).toBeTruthy();
    }
  );

  it.each(["/lich", "/ke-hoach", "/do-dung", "/ngan-sach", "/tro-ly", "/so-me-va-be", "/tim-kiem", "/cai-dat", "/huong-dan", "/studio", "/nha-minh/ho-so"]) (
    "keeps shared tool %s under Nhà mình", path => {
      expect(getPageContext(path, false)?.parentHref).toBe("/nha-minh");
      expect(getPageContext(path, true)?.parentHref).toBe("/nha-minh");
    }
  );

  it("preserves logical memory and baby parents even when their bottom tabs change", () => {
    expect(getPageContext("/ky-niem/thai-ky", true)).toEqual({ parentHref: "/ky-niem", parentLabel: "Kỷ niệm", title: "Kỷ niệm thai kỳ" });
    expect(getPageContext("/nhat-ky", true)?.parentHref).toBe("/ky-niem");
    expect(getPageContext("/ghi-lai", true)?.parentHref).toBe("/ky-niem");
    expect(getPageContext("/be/ho-so", false)?.parentHref).toBe("/be");
    expect(getPageContext("/be/phat-trien", true)?.parentHref).toBe("/be");
  });

  it("does not invent labels from unknown paths or title-like strings", () => {
    expect(getPageContext("/unknown", false)).toBeNull();
    expect(getPageContext("/studio-fake", false)).toBeNull();
    expect(getPageContext("/studio/<script>", false)?.title).toBe("Kịch bản & video");
  });
});
