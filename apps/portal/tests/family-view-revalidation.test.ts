import { describe, expect, it, vi } from "vitest";

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

import { revalidateFamilyViews } from "../src/lib/family-view-revalidation";

describe("family view revalidation", () => {
  it("invalidates the server-rendered Today page after a successful write", () => {
    revalidateFamilyViews();

    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});
