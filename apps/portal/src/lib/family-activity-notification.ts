import { isUuidV4 } from "./photo-upload-server";
import { normalizeEndpoint } from "./push-notification-contract";

export type FamilyActivityKind = "meal" | "health" | "medical" | "journal" | "memory" | "task" | "inventory" | "profile" | "baby";

export type FamilyActivityReport = {
  eventId: string;
  sourceEndpoint: string | null;
  kind: FamilyActivityKind | null;
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
  if (!isUuidV4(input.eventId) || typeof input.pathname !== "string" || input.pathname.length > 256
      || typeof input.method !== "string" || !mutationMethods.has(input.method.toUpperCase())) return null;
  let parsed: URL;
  try { parsed = new URL(input.pathname, "https://embe.invalid"); } catch { return null; }
  if (parsed.origin !== "https://embe.invalid" || parsed.search || parsed.hash || !parsed.pathname.startsWith("/api/")) return null;
  const sourceEndpoint = input.sourceEndpoint === null || input.sourceEndpoint === undefined
    ? null
    : normalizeEndpoint(input.sourceEndpoint);
  if (input.sourceEndpoint !== null && input.sourceEndpoint !== undefined && !sourceEndpoint) return null;
  return { eventId: input.eventId, sourceEndpoint, kind: familyActivityKind(parsed.pathname) };
}
