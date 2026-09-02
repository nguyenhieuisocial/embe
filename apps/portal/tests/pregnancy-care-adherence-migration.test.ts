import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("pregnancy care adherence migration", () => {
  it("stores bounded dose states and exposes service-role-only RPCs", () => {
    const path = join(process.cwd(), "..", "..", "supabase", "migrations", "20260902100000_expand_pregnancy_care_adherence.sql");
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const sql = readFileSync(path, "utf8");
    expect(sql).toContain("status IN ('taken', 'skipped', 'deferred')");
    expect(sql).toContain("char_length(reason) <= 120");
    expect(sql).toContain("embe_record_pregnancy_care_intake");
    expect(sql).toContain("embe_set_pregnancy_care_plan_active");
    expect(sql).toContain("adherence_history");
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).toContain("TO service_role");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
  });
});
