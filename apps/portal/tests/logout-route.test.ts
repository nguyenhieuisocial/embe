import { describe, expect, it } from "vitest";

import { POST } from "../src/app/api/auth/logout/route";

describe("family logout endpoint", () => {
  it("clears the private session and returns to login", async () => {
    const response = await POST(new Request("https://embe.hieu.asia/api/auth/logout", { method: "POST" }));
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://embe.hieu.asia/login");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(cookie).toContain("embe_session=");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
  });
});
