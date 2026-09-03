import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("pregnancy care adherence migration", () => {
  it("persists clinician-plan and self-purchased sources as separate bounded values", () => {
    const path = join(process.cwd(), "..", "..", "supabase", "migrations", "20260903173000_separate_self_purchased_care.sql");
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const sql = readFileSync(path, "utf8");
    expect(sql).toContain("entry_source");
    expect(sql).toContain("'clinician_plan', 'self_purchased'");
    expect(sql).toContain("p_entry_source");
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).toContain("TO service_role");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
  });

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

  it("links only confirmed semantic evidence to bounded checklist items", () => {
    const path = join(process.cwd(), "..", "..", "supabase", "migrations", "20260902171159_link_daily_actions.sql");
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const sql = readFileSync(path, "utf8");

    expect(sql).toContain("portal_read_model.complete_linked_daily_action");
    expect(sql).toContain("WHEN 'breakfast' THEN 'breakfast'");
    expect(sql).toContain("WHEN 'lunch' THEN 'lunch'");
    expect(sql).toContain("WHEN 'dinner' THEN 'dinner'");
    expect(sql).toContain("AT TIME ZONE 'Asia/Ho_Chi_Minh'");
    expect(sql).toContain("ON CONFLICT (day, task_id) DO NOTHING");
    expect(sql).toContain("status IN ('nutrition_pending', 'confirmed')");
    expect(sql).toContain("count(*) FILTER (WHERE intake.status = 'taken')");
    expect(sql).toContain("'supplements'");
    expect(sql).toContain("SECURITY INVOKER");
  });
});
