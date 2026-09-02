import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("uploaded photo metadata migration", () => {
  it("stores capture time, exact coordinates and an editable place label privately", () => {
    const sql = readFileSync("../../supabase/migrations/20260901125059_add_uploaded_photo_metadata.sql", "utf8");
    expect(sql).toContain("location_name");
    expect(sql).toContain("latitude");
    expect(sql).toContain("longitude");
    expect(sql).toContain("embe_update_uploaded_media_metadata");
    expect(sql).toContain("metadata_dirty");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
  });
});
