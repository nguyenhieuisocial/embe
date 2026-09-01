import { createSessionCookie } from "../src/lib/portal-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH } from "../src/app/api/pregnancy/route";

const originalEnvironment = { ...process.env };

function sessionCookie(): string {
  return `embe_session=${createSessionCookie("server-secret")}`;
}

function patchRequest(body: unknown, authenticated = true, origin = "https://embe.hieu.asia"): Request {
  return new Request("https://embe.hieu.asia/api/pregnancy", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin,
      ...(authenticated ? { cookie: sessionCookie() } : {})
    },
    method: "PATCH"
  });
}

describe("private pregnancy state endpoint", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      due_date: "2026-10-08",
      completed: ["supplements", "water-rest"],
      has_profile: true,
      has_day_state: true
    }), { status: 200 })));
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  it("rejects reads without an intact portal session", async () => {
    const response = await GET(new Request("https://embe.hieu.asia/api/pregnancy?day=2026-08-31"));

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads a bounded day through the server-only RPC", async () => {
    const response = await GET(new Request("https://embe.hieu.asia/api/pregnancy?day=2026-08-31", {
      headers: { cookie: sessionCookie() }
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const payload = await response.json();
    expect(payload).toEqual({
      dueDate: "2026-10-08",
      completed: ["supplements", "water-rest"],
      hasProfile: true,
      hasDayState: true
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/embe_get_pregnancy_state",
      expect.objectContaining({
        body: JSON.stringify({ p_day: "2026-08-31" }),
        method: "POST"
      })
    );
    expect(JSON.stringify(payload)).not.toContain("server-only-key");
  });

  it("rejects invalid dates, task IDs and duplicate task IDs", async () => {
    const invalidDay = await PATCH(patchRequest({ day: "31-08-2026", completed: [] }));
    const invalidTask = await PATCH(patchRequest({ day: "2026-08-31", completed: ["unknown"] }));
    const duplicateTask = await PATCH(patchRequest({ day: "2026-08-31", completed: ["notes", "notes"] }));

    expect(invalidDay.status).toBe(400);
    expect(invalidTask.status).toBe(400);
    expect(duplicateTask.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a foreign origin before storage", async () => {
    const response = await PATCH(patchRequest(
      { day: "2026-08-31", completed: [] },
      true,
      "https://attacker.example"
    ));

    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an oversized body even when content-length is absent", async () => {
    const response = await PATCH(new Request("https://embe.hieu.asia/api/pregnancy", {
      body: JSON.stringify({ day: "2026-08-31", padding: "x".repeat(5000) }),
      headers: { cookie: sessionCookie(), "content-type": "application/json", origin: "https://embe.hieu.asia" },
      method: "PATCH"
    }));

    expect(response.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("saves an atomic cross-device snapshot with explicit field flags", async () => {
    const response = await PATCH(patchRequest({
      day: "2026-08-31",
      dueDate: "2026-10-08",
      completed: ["supplements", "notes"]
    }));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/embe_save_pregnancy_state",
      expect.objectContaining({
        body: JSON.stringify({
          p_day: "2026-08-31",
          p_due_date: "2026-10-08",
          p_completed: ["supplements", "notes"],
          p_write_due_date: true,
          p_write_completed: true
        }),
        method: "POST"
      })
    );
  });

  it("supports clearing the due date without overwriting the checklist", async () => {
    await PATCH(patchRequest({ day: "2026-08-31", dueDate: null }));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("embe_save_pregnancy_state"),
      expect.objectContaining({
        body: JSON.stringify({
          p_day: "2026-08-31",
          p_due_date: null,
          p_completed: null,
          p_write_due_date: true,
          p_write_completed: false
        })
      })
    );
  });

  it("fails closed when the private database is unavailable", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    const response = await PATCH(patchRequest({ day: "2026-08-31", completed: [] }));

    expect(response.status).toBe(503);
  });
});
