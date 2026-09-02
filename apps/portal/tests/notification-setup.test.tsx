import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import NotificationSetup from "../src/components/notification-setup";

describe("family notification setup", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows which family phones are ready", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      roles: { mother: false, father: true }, enabledDevices: 1
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationSetup role="mother" />);

    await waitFor(() => expect(screen.getByText("Ba Hiếu đã bật")).toBeInTheDocument());
    expect(screen.getByText("Mẹ Ngân chưa bật")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/subscriptions", { cache: "no-store" });
  });
});
