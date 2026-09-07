import { isUuidV4 } from "./photo-upload-server";
import { normalizeEndpoint } from "./push-notification-contract";

export type FamilyActivityKind = "meal" | "health" | "medical" | "journal" | "memory" | "task" | "inventory" | "profile" | "baby";

export type FamilyActivityReport = {
  eventId: string;
  sourceDeviceId: string;
  sourceEndpoint: string | null;
  kind: FamilyActivityKind | null;
  action: string;
  subject: string;
  url: string;
  resourceId: string | null;
  resourceType: "record" | "document" | null;
};

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function familyActivityKind(pathname: string): FamilyActivityKind | null {
  if (pathname === "/api/meals" || /^\/api\/meals\/[^/]+(?:\/complete)?$/.test(pathname)) return "meal";
  if (/^\/api\/pregnancy\/(?:care|health|iphone-health|mental-health|symptoms)$/.test(pathname) || pathname === "/api/postpartum/health") return "health";
  if (pathname === "/api/pregnancy/records" || pathname.startsWith("/api/pregnancy/records/") || pathname.startsWith("/api/pregnancy/documents/")) return "medical";
  if (pathname === "/api/journal") return "journal";
  if (pathname === "/api/memories" || pathname.startsWith("/api/memories/") || /^\/api\/photo-uploads\/[^/]+\/complete$/.test(pathname)) return "memory";
  if (pathname === "/api/tasks" || /^\/api\/tasks\/[^/]+$/.test(pathname) || pathname.startsWith("/api/birth-prep")) return "task";
  if (pathname === "/api/inventory" || pathname === "/api/procurement") return "inventory";
  if (pathname === "/api/pregnancy" || pathname === "/api/trash" || /^\/api\/(?:family\/(?:lifecycle|profile)|pregnancy\/profile)$/.test(pathname)) return "profile";
  if (/^\/api\/baby\/(?:care|development|medical)(?:\/.*)?$/.test(pathname)) return "baby";
  return null;
}

export function normalizeFamilyActivityReport(value: unknown): FamilyActivityReport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!isUuidV4(input.eventId) || !isUuidV4(input.sourceDeviceId)
      || typeof input.pathname !== "string" || input.pathname.length > 256
      || typeof input.method !== "string" || !mutationMethods.has(input.method.toUpperCase())) return null;
  let parsed: URL;
  try { parsed = new URL(input.pathname, "https://embe.invalid"); } catch { return null; }
  if (parsed.origin !== "https://embe.invalid" || parsed.search || parsed.hash || !parsed.pathname.startsWith("/api/")) return null;
  const sourceEndpoint = input.sourceEndpoint === null || input.sourceEndpoint === undefined
    ? null
    : normalizeEndpoint(input.sourceEndpoint);
  if (input.sourceEndpoint !== null && input.sourceEndpoint !== undefined && !sourceEndpoint) return null;
  if (input.resourceId !== undefined && input.resourceId !== null && !isUuidV4(input.resourceId)) return null;
  const kind = familyActivityKind(parsed.pathname);
  const method = input.method.toUpperCase();
  const detail = describeFamilyActivity(parsed.pathname, method, input.responseStatus === 201, input.resourceId as string | null);
  return { eventId: input.eventId, sourceDeviceId: input.sourceDeviceId, sourceEndpoint,
    kind: detail ? kind : null, ...(detail ?? { action: "updated", subject: "thông tin gia đình", url: "/", resourceId: null, resourceType: null }) };
}

// Only server-owned copy and identifiers enter the queue, never client captions,
// notes, diagnoses, credentials or raw request/response bodies.
export function describeFamilyActivity(path: string, method: string, created = false, resourceId?: string | null) {
  const kind = familyActivityKind(path);
  if (!kind) return null;
  let action = method === "DELETE" ? "deleted" : created ? "created" : "updated";
  let subject = ({ meal: "bữa ăn", health: "số đo sức khỏe", medical: "hồ sơ khám", journal: "nhật ký",
    memory: "kỷ niệm", task: "việc cần làm", inventory: "đồ dùng", profile: "hồ sơ gia đình", baby: "sổ của Bé" })[kind];
  let url = ({ meal: "/me-bau/bua-an", health: "/me-bau/suc-khoe", medical: "/me-bau/ho-so", journal: "/nhat-ky",
    memory: "/ky-niem", task: "/ke-hoach", inventory: "/do-dung", profile: "/cai-dat", baby: "/be" })[kind];
  let resourceType: "record" | "document" | null = null;
  if (kind === "medical") {
    // Presigning an upload or queueing OCR is not a completed family update.
    const doc = path.match(/^\/api\/pregnancy\/documents\/([^/]+)(?:\/(scan|import))?$/);
    const record = path.match(/^\/api\/pregnancy\/records(?:\/([^/]+))?$/);
    if (doc && isUuidV4(doc[1])) {
      if (!doc[2] && method === "POST") action = "uploaded";
      else if (doc[2] === "scan" && method === "PATCH") action = "confirmed";
      else if (doc[2] === "import" && method === "POST") action = "imported";
      else return null;
      resourceId = doc[1]; resourceType = "document"; subject = "tài liệu khám";
      url = `/me-bau/ho-so/tai-lieu/${resourceId}`;
    } else if (record && (!record[1] || isUuidV4(record[1]))) {
      resourceId = record[1] ?? resourceId; resourceType = "record";
      if (resourceId && method !== "DELETE") url += `#record-${resourceId}`;
    } else return null;
  }
  const subjects: Record<string, string> = {
    "/api/pregnancy/care": "thuốc/vi chất", "/api/pregnancy/iphone-health": "dữ liệu sức khỏe từ iPhone",
    "/api/pregnancy/mental-health": "nhật ký tâm trạng", "/api/pregnancy/symptoms": "nhật ký triệu chứng",
    "/api/postpartum/health": "sổ phục hồi sau sinh", "/api/family/lifecycle": "giai đoạn của gia đình",
    "/api/family/profile": "thông tin thành viên", "/api/pregnancy/profile": "hồ sơ thai kỳ",
    "/api/procurement": "danh sách mua sắm", "/api/trash": "mục trong thùng rác"
  };
  subject = subjects[path] ?? subject;
  if (path === "/api/pregnancy/iphone-health") { if (method !== "DELETE") action = "synced"; url = "/me-bau/suc-khoe-iphone"; }
  if (path === "/api/pregnancy/care") url = "/me-bau/suc-khoe-iphone#vi-chat-thuoc";
  if (path.endsWith("/reactions")) { subject = "cảm xúc trên kỷ niệm"; }
  if (path.startsWith("/api/birth-prep")) subject = "kế hoạch đi sinh";
  if (path.startsWith("/api/baby/care")) subject = "nhật ký ăn, ngủ và thay tã của Bé";
  if (path.startsWith("/api/baby/development")) subject = "mốc phát triển của Bé";
  if (path.startsWith("/api/baby/medical")) subject = "hồ sơ khám của Bé";
  if (/^\/api\/photo-uploads\/[^/]+\/complete$/.test(path)) { subject = "ảnh kỷ niệm"; action = "uploaded"; }
  return { action, subject, url, resourceId: resourceId ?? null, resourceType };
}
