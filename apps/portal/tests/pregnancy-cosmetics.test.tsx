import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PregnancySafetySearch from "../src/components/pregnancy-safety-search";
import { pregnancyCosmetics } from "../src/lib/pregnancy-cosmetics";

describe("pregnancy cosmetics guidance", () => {
  it("finds all cosmetics without silently truncating the catalogue", () => {
    render(<PregnancySafetySearch />);
    fireEvent.click(screen.getByRole("button", { name: "mỹ phẩm" }));
    expect(screen.getByText("Sơn móng, gel và acetone")).toBeTruthy();
    expect(screen.getByText("Retinoid: retinol, tretinoin, adapalene, tazarotene")).toBeTruthy();
    expect(screen.getByText(/Chưa có trong danh mục/)).toBeTruthy();
  });
  it("retains conditional advice, distinct IDs and sources", () => {
    expect(new Set(pregnancyCosmetics.map(item => item.id)).size).toBe(pregnancyCosmetics.length);
    expect(pregnancyCosmetics.find(item => item.id === "skin-bha")?.level).toBe("limit");
    expect(pregnancyCosmetics.find(item => item.id === "skin-retinoid")?.level).toBe("avoid");
    expect(pregnancyCosmetics.every(item => item.sourceHref.startsWith("https://") && item.action.length > 0)).toBe(true);
  });
});
