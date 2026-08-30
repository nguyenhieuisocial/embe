import { describe, expect, it } from "vitest";

import { GET } from "../src/app/api/health/route";

describe("health endpoint", () => {
  it("reports that the portal is healthy without caching", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
