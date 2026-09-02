import { createSessionCookie } from "../src/lib/portal-auth";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

import { POST } from "../src/app/api/family/export/route";
import FamilyDataExport from "../src/components/family-data-export";

const originalEnvironment = { ...process.env };

function request(authenticated = true, origin = "https://embe.hieu.asia"): Request {
  return new Request("https://embe.hieu.asia/api/family/export", {
    method: "POST",
    headers: {
      origin,
      ...(authenticated ? { cookie: `embe_session=${createSessionCookie(
        "server-secret", new Date(), "10000000-0000-4000-8000-000000000001"
      )}` } : {})
    }
  });
}

describe("private family JSON export", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
    rpc.mockReset();
  });
  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  it("requires the family session and same-origin CSRF check", async () => {
    expect((await POST(request(false))).status).toBe(401);
    expect((await POST(request(true, "https://attacker.example"))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("downloads one versioned JSON package without secrets or binary media", async () => {
    rpc.mockResolvedValueOnce({ data: {
      schema_version: "embe-family-export/v1", generated_at: "2026-09-02T10:00:00Z",
      data: { pregnancy: { mental_health: [{ mood: 4, anxiety: 2 }] }, tasks: {}, meals: [], lifecycle: [], postpartum: [], baby: {}, inventory: {}, journal: {} }
    }, error: null });
    const response = await POST(request());
    const body = await response.text();
    const payload = JSON.parse(body);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="embe-family-data-/);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(payload.schema_version).toBe("embe-family-export/v1");
    expect(payload.data.pregnancy.mental_health).toEqual([{ mood: 4, anxiety: 2 }]);
    expect(JSON.stringify(payload)).not.toMatch(/token_hash|storage_path|object_path|binary|secret/i);
    expect(rpc).toHaveBeenCalledWith("embe_export_family_data_v2");
    expect(body).not.toContain("\n  ");
  });

  it("refuses an export that is too large or contains a newly named credential", async () => {
    rpc.mockResolvedValueOnce({ data: { data: { api_key: "must-not-leak" } }, error: null });
    expect((await POST(request())).status).toBe(503);

    rpc.mockResolvedValueOnce({ data: { data: { notes: "x".repeat(5 * 1024 * 1024) } }, error: null });
    expect((await POST(request())).status).toBe(413);
  });

  it("confirms the sensitive download, explains Memos coverage, and announces completion", async () => {
    const createObjectURL = vi.fn(() => "blob:family-export");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    vi.stubGlobal("confirm", vi.fn(() => true));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      schema_version: "embe-family-export/v1", generated_at: "2026-09-02T10:00:00Z", data: {}
    }, { status: 200, headers: { "content-disposition": "attachment; filename=\"embe-family-data.json\"" } })));
    render(<FamilyDataExport />);
    expect(screen.getByText(/không gồm file ảnh, video hay tài liệu gốc/i)).toBeInTheDocument();
    expect(screen.getByText(/nhật ký đã đồng bộ sang Memos không nằm trọn/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xuất dữ liệu JSON" }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/dữ liệu sức khỏe riêng tư/i));
    expect(screen.getByRole("status")).toHaveTextContent(/đã tạo bản tải xuống/i);
    expect(fetch).toHaveBeenCalledWith("/api/family/export", { method: "POST" });
    expect(document.body.querySelector('a[download="embe-family-data.json"]')).toBeNull();
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:family-export"));
  });

  it("does not start the export when the family cancels the privacy confirmation", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<FamilyDataExport />);
    fireEvent.click(screen.getByRole("button", { name: "Xuất dữ liệu JSON" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
