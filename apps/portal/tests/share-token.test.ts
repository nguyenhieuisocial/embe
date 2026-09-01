import { afterEach, describe, expect, it } from "vitest";

import { createMediaShareToken, verifyMediaShareToken } from "../src/lib/share-token";

const originalEnvironment = { ...process.env };
const ID = "11111111-1111-4111-8111-111111111111";

describe("temporary media share tokens", () => {
  afterEach(() => { process.env = { ...originalEnvironment }; });

  it("accepts an intact token before its seven-day expiry", () => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "share-secret";
    const now = new Date("2026-09-01T10:00:00Z");
    const token = createMediaShareToken(ID, now);

    expect(verifyMediaShareToken(token, new Date("2026-09-08T09:59:59Z"))).toEqual({ id: ID });
  });

  it("rejects changed and expired tokens", () => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "share-secret";
    const now = new Date("2026-09-01T10:00:00Z");
    const token = createMediaShareToken(ID, now);

    expect(verifyMediaShareToken(`${token.slice(0, -1)}x`, now)).toBeNull();
    expect(verifyMediaShareToken(token, new Date("2026-09-08T10:00:01Z"))).toBeNull();
  });

  it("fails closed when the server secret is unavailable", () => {
    delete process.env.EMBE_PORTAL_SESSION_SECRET;
    expect(() => createMediaShareToken(ID)).toThrow();
    expect(verifyMediaShareToken("anything")).toBeNull();
  });
});
