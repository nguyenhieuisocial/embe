import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionCookie } from "../src/lib/portal-auth";

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
import { GET, PATCH, POST } from "../src/app/api/family/budget/route";

const env = { ...process.env };
const row = { id: "11111111-1111-4111-8111-111111111111", incurred_on: "2026-09-02", kind: "actual", category: "pregnancy_visit", amount_vnd: 500000, description: "Khám thai", note: "", created_at: "2026-09-02T01:00:00.000Z", updated_at: "2026-09-02T01:00:00.000Z" };
function request(method: string, body?: unknown, auth = true, origin = "https://embe.hieu.asia") { return new Request("https://embe.hieu.asia/api/family/budget", { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(method === "GET" ? {} : { origin }), ...(auth ? { cookie: `embe_session=${createSessionCookie("secret", new Date(), row.id)}` } : {}) } }); }

describe("private family budget API", () => {
  beforeEach(() => { process.env.EMBE_PORTAL_SESSION_SECRET = "secret"; process.env.SUPABASE_URL = "https://project.supabase.co"; process.env.SUPABASE_SECRET_KEY = "key"; rpc.mockReset(); });
  afterEach(() => { process.env = { ...env }; });
  it("requires the family session", async () => { expect((await GET(request("GET", undefined, false))).status).toBe(401); expect(rpc).not.toHaveBeenCalled(); });
  it("lists normalized expenses", async () => { rpc.mockResolvedValueOnce({ data: [row], error: null }); const response = await GET(request("GET")); expect(response.status).toBe(200); await expect(response.json()).resolves.toMatchObject({ entries: [{ amountVnd: 500000, description: "Khám thai" }] }); });
  it("creates an exact, bounded entry", async () => { rpc.mockResolvedValueOnce({ data: row, error: null }); const response = await POST(request("POST", { id: row.id, incurredOn: row.incurred_on, kind: "actual", category: "pregnancy_visit", amountVnd: 500000, description: "Khám thai", note: "" })); expect(response.status).toBe(201); expect(rpc).toHaveBeenCalledWith("embe_save_family_expense", expect.any(Object)); });
  it("soft deletes and restores an entry", async () => { rpc.mockResolvedValue({ data: true, error: null }); expect((await PATCH(request("PATCH", { id: row.id, deleted: true }))).status).toBe(200); expect((await PATCH(request("PATCH", { id: row.id, deleted: false }))).status).toBe(200); });
  it("rejects cross-site and invalid costs", async () => { const foreign = await POST(request("POST", { id: row.id }, true, "https://attacker.example")); const invalid = await POST(request("POST", { id: row.id, incurredOn: "today", kind: "actual", category: "x", amountVnd: -1, description: "", note: "" })); expect([foreign.status, invalid.status]).toEqual([403, 400]); expect(rpc).not.toHaveBeenCalled(); });
});
