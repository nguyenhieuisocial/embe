import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BabyDailyPage from "../src/app/be/page";

describe("baby daily page", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("embe:device-role", "mother");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T08:00:00+07:00"));
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return Response.json({ event: { id: "2e39dad3-c419-458d-beba-9c2063289792", ...body, syncStatus: "pending", babybuddyId: null } }, { status: 201 });
      }
      return Response.json({ events: [] });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("starts the first feeding directly from the postpartum transition link without duplicating on rerender", async () => {
    window.history.replaceState({}, "", "/be?quick=feeding");

    const { rerender } = render(<BabyDailyPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    rerender(<BabyDailyPage />);
    await act(async () => { await Promise.resolve(); });

    const posts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0]?.[1]?.body))).toMatchObject({
      kind: "feeding",
      endedAt: null,
      details: { mode: "breast", side: null }
    });
    expect(screen.getByRole("heading", { name: "Đang diễn ra" })).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("starts breastfeeding with one tap and shows an end action", async () => {
    render(<BabyDailyPage />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: /Bú trái/ }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(fetch).toHaveBeenLastCalledWith("/api/baby/care", expect.objectContaining({ method: "POST" }));
    expect(screen.getByRole("heading", { name: "Đang diễn ra" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kết thúc/ })).toBeInTheDocument();
  });
});
