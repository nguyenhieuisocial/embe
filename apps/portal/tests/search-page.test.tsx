import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/family-search", () => ({
  normalizeFamilySearch: (value: string) => value.trim(),
  searchFamilyContent: vi.fn(async () => ({ memories: [], journal: [] }))
}));

import SearchPage from "../src/app/tim-kiem/page";

describe("family search page", () => {
  it("starts with a compact iPhone-friendly search form", async () => {
    render(await SearchPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("searchbox", { name: "Tìm trong EmBe" })).toHaveAttribute("inputmode", "search");
    expect(screen.getByRole("button", { name: "Tìm" })).toBeInTheDocument();
    expect(screen.getByText(/ngày, album, địa điểm hoặc lời đã ghi/)).toBeInTheDocument();
  });
});
