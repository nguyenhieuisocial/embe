import { describe, expect, it } from "vitest";
import { normalizeFamilyActivityReport } from "../src/lib/family-activity-notification";
const id = "33333333-3333-4333-8333-333333333333";
function report(pathname: string, method = "POST", extra = {}) {
  return normalizeFamilyActivityReport({ eventId: id, sourceDeviceId: id, pathname, method, ...extra });
}
describe("specific family activity descriptions", () => {
  it("keeps upload, confirmation, structured import and deletion distinct", () => {
    expect(report(`/api/pregnancy/documents/${id}`)).toMatchObject({ action: "uploaded", resourceId: id, resourceType: "document" });
    expect(report(`/api/pregnancy/documents/${id}/scan`, "PATCH")).toMatchObject({ action: "confirmed" });
    expect(report(`/api/pregnancy/documents/${id}/import`)).toMatchObject({ action: "imported" });
    expect(report(`/api/pregnancy/records/${id}`, "DELETE")).toMatchObject({ action: "deleted", url: "/me-bau/ho-so", resourceId: id });
    expect(report("/api/pregnancy/records", "POST", { resourceId: id, responseStatus: 201 })).toMatchObject({ action: "created", url: `/me-bau/ho-so#record-${id}` });
  });
  it("does not announce unsigned uploads, queued OCR or medication scan requests", () => {
    for (const path of [`/api/pregnancy/records/${id}/documents`, `/api/pregnancy/documents/${id}/scan`, `/api/pregnancy/documents/${id}/medication-scan`]) {
      expect(report(path)?.kind).toBeNull();
    }
  });
  it("uses subtype copy and rejects client-controlled prose or unsafe references", () => {
    expect(report("/api/pregnancy/mental-health")).toMatchObject({ subject: "nhật ký tâm trạng" });
    expect(report("/api/pregnancy/iphone-health")).toMatchObject({ subject: "dữ liệu sức khỏe từ iPhone", action: "synced" });
    expect(report("/api/pregnancy/care", "POST", { body: "private", subject: "fake", title: "fake", url: "https://evil.test" })).toMatchObject({ subject: "thuốc/vi chất", url: "/me-bau/suc-khoe-iphone#vi-chat-thuoc" });
    expect(report("/api/pregnancy/iphone-health", "DELETE")).toMatchObject({ action: "deleted" });
    expect(report("https://evil.test/api/meals")).toBeNull();
    expect(report("/api/meals?secret=x")).toBeNull();
    expect(report("/api/meals", "GET")).toBeNull();
    expect(report("/api/pregnancy/records", "POST", { resourceId: "not-uuid" })).toBeNull();
  });
});
