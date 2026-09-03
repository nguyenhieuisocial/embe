import { beforeEach, describe, expect, it, vi } from "vitest";

const getFamilyTasks = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const inventoryLimit = vi.hoisted(() => vi.fn());
const inventoryOrder = vi.hoisted(() => vi.fn(() => ({ limit: inventoryLimit })));
const inventoryEq = vi.hoisted(() => vi.fn(() => ({ order: inventoryOrder })));
const inventorySelect = vi.hoisted(() => vi.fn(() => ({ eq: inventoryEq })));
const from = vi.hoisted(() => vi.fn(() => ({ select: inventorySelect })));

vi.mock("../src/lib/family-tasks-server", () => ({ getFamilyTasks }));
vi.mock("../src/lib/photo-upload-server", () => ({ photoStore: () => ({ rpc, from }) }));

import { getTodaySnapshot } from "../src/lib/today-server";

describe("Today server snapshot", () => {
  beforeEach(() => {
    getFamilyTasks.mockReset().mockResolvedValue([]);
    rpc.mockReset().mockImplementation(async (name: string) => {
      if (name === "embe_get_pregnancy_care") return { data: { plans: [] }, error: null };
      if (name === "embe_get_unified_pregnancy_health_history") return { data: [{ day: "2026-09-02", weight_kg: 55, metric_sources: { weightKg: "iphone" } }], error: null };
      if (name === "embe_list_meal_history") return { data: [{ eaten_at: "2026-09-02T05:00:00+07:00" }], error: null };
      if (name === "embe_get_pregnancy_profile") return { data: { due_date: "2027-04-20", contacts: [{}] }, error: null };
      return { data: null, error: new Error("unexpected RPC") };
    });
    from.mockClear();
    inventorySelect.mockClear();
    inventoryEq.mockClear();
    inventoryOrder.mockClear();
    inventoryLimit.mockReset().mockResolvedValue({
      data: [{ source_product_id: 12, name: "Bỉm sơ sinh", quantity: 7, unit: "cái", min_quantity: 10 }],
      error: null
    });
  });

  it("reads only low supplies and includes them in the Today priorities", async () => {
    const snapshot = await getTodaySnapshot(new Date("2026-09-02T08:00:00+07:00"));

    expect(from).toHaveBeenCalledWith("embe_inventory_item");
    expect(inventoryEq).toHaveBeenCalledWith("needs_restock", true);
    expect(inventoryLimit).toHaveBeenCalledWith(3);
    expect(snapshot.priorities[0]).toMatchObject({ kind: "inventory", title: "Bỉm sơ sinh sắp hết" });
    expect(snapshot.unavailableSources).not.toContain("đồ dùng");
  });

  it("does not invent a stock state when the private projection is unavailable", async () => {
    inventoryLimit.mockResolvedValueOnce({ data: null, error: new Error("unavailable") });

    const snapshot = await getTodaySnapshot(new Date("2026-09-02T08:00:00+07:00"));

    expect(snapshot.priorities.some((item) => item.kind === "inventory")).toBe(false);
    expect(snapshot.unavailableSources).toContain("đồ dùng");
  });
});
