import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("focused pregnancy tool routing", () => {
  it("sends family activity and reminders directly to the focused screen", () => {
    const sql = readFileSync(join(process.cwd(), "..", "..", "supabase", "migrations", "20260903133000_route_pregnancy_tools.sql"), "utf8");

    expect(sql).toContain("WHEN 'meal' THEN '/me-bau/bua-an'");
    expect(sql).toContain("WHEN 'health' THEN '/me-bau/suc-khoe'");
    expect(sql).toContain("'/me-bau/ho-so#ho-so-kham'");
    expect(sql).toContain("'/me-bau/suc-khoe-iphone#vi-chat-thuoc'");
    expect(sql).toContain("WHERE status IN ('pending', 'failed')");
  });
});
