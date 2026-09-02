import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("portal session registry migration", () => {
  it("stores revocable sessions without raw network identifiers", () => {
    const sql = readFileSync(join(process.cwd(), "..", "..", "supabase", "migrations", "20260902104000_add_portal_sessions.sql"), "utf8");
    expect(sql).toContain("portal_session");
    expect(sql).toContain("device_name");
    expect(sql).toContain("revoked_at");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("embe_verify_portal_session");
    expect(sql).toContain("embe_revoke_portal_sessions");
    expect(sql).not.toMatch(/ip_address|inet|user_agent/);
  });
});
