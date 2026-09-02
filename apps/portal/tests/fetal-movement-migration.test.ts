import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "..", "..", "supabase", "migrations", "20260902173947_add_fetal_movement_sessions.sql"), "utf8");

describe("fetal movement storage migration", () => {
  it("keeps private health data server-only and atomically increments taps", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON TABLE portal_read_model.fetal_movement_session FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("movement_count = session.movement_count + 1");
    expect(sql).toContain("fetal_movement_one_active_idx");
  });

  it("includes movement sessions in the encrypted family export source", () => {
    expect(sql).toContain("'{data,pregnancy,fetal_movement_sessions}'");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.embe_export_family_data_v2()");
  });
});
