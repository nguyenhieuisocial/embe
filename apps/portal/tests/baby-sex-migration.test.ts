import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("baby sex growth foundation migration", () => {
  it("stores only WHO-compatible sex values behind the private lifecycle RPC", () => {
    const path = join(process.cwd(), "..", "..", "supabase", "migrations", "20260901195000_add_baby_sex_for_growth.sql");
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const sql = readFileSync(path, "utf8");
    expect(sql).toContain("baby_sex");
    expect(sql).toContain("IN ('male', 'female')");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("SECURITY INVOKER");
  });
});
