import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("meal recording links the daily checklist", () => {
  const sql = readFileSync(join(
    process.cwd(), "..", "..", "supabase", "migrations",
    "20260903042316_link_recorded_meals_to_daily_checklist.sql"
  ), "utf8");

  it("completes a meal task only after a note or verified upload is recorded", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.embe_create_meal_note");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.embe_complete_meal_upload");
    expect(sql.match(/complete_linked_daily_action/g)).toHaveLength(2);
    expect(sql).toContain("ON CONFLICT (idempotency_key) DO NOTHING");
    expect(sql).toContain("AT TIME ZONE 'Asia/Ho_Chi_Minh'");
  });

  it("keeps both functions private to the server role", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.embe_create_meal_note");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.embe_create_meal_note");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.embe_complete_meal_upload");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.embe_complete_meal_upload");
  });
});
