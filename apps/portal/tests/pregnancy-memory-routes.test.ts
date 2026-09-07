import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../src/app/api/family/members/[id]/records/route";
import { GET as getPhotos } from "../src/app/api/memories/route";
import { memberRpc } from "../src/lib/family-members-server";
import { activeSessionState } from "../src/lib/session-store";
import { getMediaMemories, type MediaMemory } from "../src/lib/media";
import { createSessionCookie } from "../src/lib/portal-auth";
import type { MemberRecord } from "../src/lib/family-members";

vi.mock("../src/lib/session-store", () => ({ activeSessionState: vi.fn() }));
vi.mock("../src/lib/media", () => ({ getMediaMemories: vi.fn() }));
vi.mock("../src/lib/family-members-server", async importOriginal => ({
  ...await importOriginal<typeof import("../src/lib/family-members-server")>(), memberRpc: vi.fn()
}));
const secret = "pregnancy-memory-test-secret";
const memberId = "11111111-1111-4111-8111-111111111111";
const imageId = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ id: memberId }) };
const record: MemberRecord = { id: "33333333-3333-4333-8333-333333333333", memberId, kind: "development", title: "Tuần bên con", notes: "", occurredAt: "2026-09-01T00:00:00Z", source: "", nextDueDate: null,
  metric: null, value: null, secondaryValue: null, unit: null, revision: 0, deleted: false, pregnancyMemory: { dueDate: "2027-03-01", week: 13, mediaIds: [imageId] } };
const photo: MediaMemory = { id: imageId, title: "Ảnh", caption: "Kỷ niệm", eventAt: record.occurredAt, mimeType: "image/jpeg", width: 800, height: 1200, reactions: {}, placeCity: null, placeRegion: null, placeCountry: null, albumKey: "gia-dinh", albumTitle: "Gia đình", albumOrder: 0 };
function request(path: string, value?: unknown, origin = "https://embe.hieu.asia") {
  return new Request(`https://embe.hieu.asia${path}`, { headers: { cookie: `embe_session=${createSessionCookie(secret, new Date(), memberId)}`, origin, "content-type": "application/json" },
    ...(value === undefined ? {} : { method: "POST", body: JSON.stringify(value) }) });
}
const path = `/api/family/members/${memberId}/records`;
beforeEach(() => {
  vi.stubEnv("EMBE_PORTAL_SESSION_SECRET", secret);
  vi.mocked(activeSessionState).mockResolvedValue("active");
  vi.mocked(getMediaMemories).mockResolvedValue([photo]);
  vi.mocked(memberRpc).mockResolvedValue({ status: 200, data: { records: [], latest: [] } });
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

describe("private pregnancy memory routes", () => {
  it("checks revoked sessions before reading collections or resolving photo ids", async () => {
    vi.mocked(activeSessionState).mockResolvedValue("revoked");
    expect((await GET(request(`${path}?collection=pregnancy`), context)).status).toBe(401);
    expect((await getPhotos(request(`/api/memories?ids=${imageId}`))).status).toBe(401);
    expect(memberRpc).not.toHaveBeenCalled(); expect(getMediaMemories).not.toHaveBeenCalled();
  });
  it("rejects cross-origin mutations before resolving private photos", async () => {
    expect((await POST(request(path, record, "https://untrusted.example"), context)).status).toBe(403);
    expect(memberRpc).not.toHaveBeenCalled(); expect(getMediaMemories).not.toHaveBeenCalled();
  });
  it("uses the filtered collection RPC and private no-store responses", async () => {
    const response = await GET(request(`${path}?collection=pregnancy&offset=40&deleted=true`), context);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(memberRpc).toHaveBeenCalledWith("embe_list_pregnancy_memories", { p_member_id: memberId, p_offset: 40, p_deleted: true });
    expect((await GET(request(`${path}?collection=anything`), context)).status).toBe(400);
  });
  it("resolves only bounded explicit photo ids, and reports upstream failure rather than an empty album", async () => {
    expect((await getPhotos(request(`/api/memories?ids=${imageId},${imageId}`))).status).toBe(400);
    expect(getMediaMemories).not.toHaveBeenCalled();
    const response = await getPhotos(request(`/api/memories?ids=${imageId}`));
    expect(response.status).toBe(200);
    expect(getMediaMemories).toHaveBeenCalledWith({ ids: [imageId], limit: 12, strict: true });
    vi.mocked(getMediaMemories).mockRejectedValue(new Error("unavailable"));
    expect((await getPhotos(request(`/api/memories?ids=${imageId}`))).status).toBe(503);
    expect((await getPhotos(request("/api/memories"))).status).toBe(503);
  });
  it("requires every selected photo before saving or restoring, but allows removing a stale selection", async () => {
    vi.mocked(getMediaMemories).mockResolvedValue([{ ...photo, id: memberId }]);
    expect((await POST(request(path, record), context)).status).toBe(409);
    expect(memberRpc).not.toHaveBeenCalled();
    vi.mocked(getMediaMemories).mockResolvedValue([]);
    expect((await POST(request(path, { ...record, revision: 2 }), context)).status).toBe(409);
    vi.mocked(memberRpc).mockResolvedValue({ status: 200, data: { ...record, revision: 3, deleted: true } });
    vi.mocked(getMediaMemories).mockClear();
    expect((await POST(request(path, { ...record, revision: 2, deleted: true }), context)).status).toBe(200);
    expect(getMediaMemories).not.toHaveBeenCalled();
  });
  it("preserves the stable record id and revision for retries without weakening photo validation", async () => {
    vi.mocked(memberRpc).mockResolvedValue({ status: 200, data: { ...record, revision: 1 } });
    for (let i = 0; i < 2; i++) expect((await POST(request(path, record), context)).status).toBe(200);
    expect(memberRpc).toHaveBeenCalledTimes(2);
    expect(vi.mocked(memberRpc).mock.calls[0]).toEqual(vi.mocked(memberRpc).mock.calls[1]);
  });
});
