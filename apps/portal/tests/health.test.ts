import { afterEach, describe, expect, it } from "vitest";

import { GET } from "../src/app/api/health/route";

describe("health endpoint", () => {
  afterEach(() => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
  });

  it("reports that the portal is healthy without caching", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "release-2";
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok", version: "release-2" });
  });
});
