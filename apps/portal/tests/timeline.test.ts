import { afterEach, describe, expect, it, vi } from "vitest";

import { getTimeline, getTimelineFreshness, parseEvent } from "../src/lib/timeline";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.unstubAllGlobals();
});

describe("curated family timeline", () => {
  it("removes internal journal metadata before exposing an event", () => {
    const event = parseEvent({
      id: "1",
      event_at: "2026-09-02T10:00:00Z",
      portal_event_type: "journal",
      title: "Ngày đáng nhớ",
      caption: "Cả nhà cùng mỉm cười.\n<!-- embe-journal:cc0cd7c4-156f-44d5-818b-53962b699555 -->\n&#x20;"
    });

    expect(event?.caption).toBe("Cả nhà cùng mỉm cười.");
  });

  it("reads approved rows only through the server secret", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-secret";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "1",
            event_at: "2026-08-30T10:00:00Z",
            portal_event_type: "journal",
            title: "Ngày đáng nhớ",
            caption: "Cả nhà cùng mỉm cười.",
            album_cover_url: null
          }
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const items = await getTimeline();

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Ngày đáng nhớ");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("embe_timeline_event"),
      expect.objectContaining({ cache: "no-store" })
    );
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.apikey).toBe("server-only-secret");
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Accept-Profile"]).toBeUndefined();
  });

  it("fails closed when server configuration or response is invalid", async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    expect(await getTimeline()).toEqual([]);

    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-secret";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 502 })));
    expect(await getTimeline()).toEqual([]);
  });

  it("allows the dedicated journal to request more history within a safe bound", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await getTimeline(200);

    expect(fetchMock.mock.calls[0][0]).toContain("limit=200");
  });

  it("reports whether the local publication is fresh without exposing credentials", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-secret";
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify([{ last_success_at: "2026-08-30T10:00:00Z" }]), { status: 200 })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await getTimelineFreshness(new Date("2026-08-30T10:10:00Z"))).toBe("fresh");
    expect(await getTimelineFreshness(new Date("2026-08-30T10:20:00Z"))).toBe("stale");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
});
