import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  supports: vi.fn(() => true),
  authenticate: vi.fn(),
  register: vi.fn()
}));

vi.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: mocks.supports,
  startAuthentication: mocks.authenticate,
  startRegistration: mocks.register
}));

import PasskeyLogin from "../src/components/passkey-login";
import PasskeySettings from "../src/components/passkey-settings";

describe("passkey mobile UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.supports.mockReturnValue(true);
    mocks.authenticate.mockResolvedValue({ id: "credential-1" });
    mocks.register.mockResolvedValue({ id: "credential-1" });
  });

  it("offers a one-tap Face ID login and verifies through the private API", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ challenge: "challenge" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ verified: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PasskeyLogin destination="/me-bau" />);

    fireEvent.click(screen.getByRole("button", { name: /Face ID/i }));
    await waitFor(() => expect(mocks.authenticate).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/auth/passkey/options", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/passkey/verify", expect.objectContaining({ method: "POST" }));
  });

  it("registers and removes named passkey devices from settings", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/devices") && (!init?.method || init.method === "GET")) {
        return Response.json({ devices: [{ credentialId: "credential-1", label: "iPhone của Mẹ Ngân", createdAt: "2026-09-02T00:00:00Z", lastUsedAt: null }] });
      }
      if (url.endsWith("/options")) return Response.json({ challenge: "challenge" });
      return Response.json({ verified: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PasskeySettings />);

    expect(await screen.findByText("iPhone của Mẹ Ngân")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Thêm Face ID/i }));
    await waitFor(() => expect(mocks.register).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/passkey/verify", expect.objectContaining({ method: "POST" }));

    fireEvent.click(screen.getByRole("button", { name: /Gỡ iPhone của Mẹ Ngân/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/passkey/devices", expect.objectContaining({ method: "DELETE" })));
  });
});
