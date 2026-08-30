import { createHmac, scryptSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createSessionCookie,
  verifyPassword,
  verifySessionCookie
} from "../src/lib/portal-auth";

describe("portal authentication", () => {
  it("accepts only the password represented by the stored scrypt hash", () => {
    const salt = "00112233445566778899aabbccddeeff";
    const derivedKey = scryptSync("family-secret", salt, 64).toString("hex");
    const storedHash = `${salt}:${derivedKey}`;

    expect(verifyPassword("family-secret", storedHash)).toBe(true);
    expect(verifyPassword("wrong-secret", storedHash)).toBe(false);
  });

  it("rejects malformed stored password hashes", () => {
    expect(verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  });

  it("creates a signed session that expires after thirty days", () => {
    const now = new Date("2026-08-30T00:00:00.000Z");
    const expiresAt = Math.floor(now.getTime() / 1000) + 60 * 60 * 24 * 30;
    const signature = createHmac("sha256", "server-secret")
      .update(String(expiresAt))
      .digest("hex");

    expect(createSessionCookie("server-secret", now)).toBe(`${expiresAt}.${signature}`);
  });

  it("accepts an intact unexpired session and rejects tampering or expiry", () => {
    const expiresAt = 1_800_000_000;
    const signature = createHmac("sha256", "server-secret")
      .update(String(expiresAt))
      .digest("hex");
    const cookie = `${expiresAt}.${signature}`;

    expect(verifySessionCookie(cookie, "server-secret", expiresAt - 1)).toBe(true);
    expect(verifySessionCookie(`${expiresAt}.${"0".repeat(64)}`, "server-secret", expiresAt - 1)).toBe(false);
    expect(verifySessionCookie(cookie, "server-secret", expiresAt)).toBe(false);
  });
});
