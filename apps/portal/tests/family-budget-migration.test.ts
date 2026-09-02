import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "..", "..", "supabase", "migrations", "20260902175148_add_family_budget.sql"), "utf8");
describe("family budget migration", () => {
  it("keeps entries private, bounded and recoverable", () => {
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON TABLE portal_read_model.family_expense FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("amount_vnd BETWEEN 0 AND 1000000000");
    expect(sql).toContain("embe_set_family_expense_deleted");
  });
  it("includes the budget in the family export", () => { expect(sql).toContain("'{data,budget}'"); });
});
