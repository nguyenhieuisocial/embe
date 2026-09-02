import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("private pregnancy symptom journal migration", () => {
  it("keeps symptom entries behind service-role-only RLS and bounded RPCs", () => {
    const path = join(process.cwd(), "..", "..", "supabase", "migrations", "20260902080000_add_pregnancy_symptom_journal.sql");
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const sql = readFileSync(path, "utf8");
    expect(sql).toContain("pregnancy_symptom_entry");
    expect(sql).toContain("severity IN ('mild', 'moderate', 'severe')");
    expect(sql).toContain("status IN ('tracking', 'resolved')");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("TO service_role");
    expect(sql).toContain("embe_get_pregnancy_symptom_history");
    expect(sql).toContain("embe_save_pregnancy_symptom_entry");
    expect(sql).toContain("embe_resolve_pregnancy_symptom_entry");
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).toContain("REVOKE ALL ON FUNCTION");
  });
});
