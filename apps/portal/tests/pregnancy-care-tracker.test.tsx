import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PregnancyCareTracker from "../src/components/pregnancy-care-tracker";

describe("iPhone health connection state", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not claim Health permission is enough when the iPhone has never sent data", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/pregnancy/care")) return new Response(JSON.stringify({ snapshot: {
        profile: null, plans: [], iphone_health: null,
        iphone_devices: [{ id: "device-1", label: "iPhone của Mẹ Ngân", active: true, last_synced_at: null }]
      } }), { status: 200 });
      return new Response(JSON.stringify({ history: [] }), { status: 200 });
    }));

    render(<PregnancyCareTracker pregnancyWeek={8} />);

    await waitFor(() => expect(screen.getByText("Đã tạo điểm nhận, iPhone chưa gửi dữ liệu")).toBeInTheDocument());
    expect(screen.queryByText("Cần cấp quyền một lần trên iPhone")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Làm lại kết nối" })).toBeInTheDocument();
  });
});
