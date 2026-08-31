import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/media", () => ({ getMediaMemories: vi.fn(async () => []) }));

import MemoriesPage from "../src/app/ky-niem/page";

describe("family memories", () => {
  it("shows a useful private empty state before parents approve photos", async () => {
    render(await MemoriesPage());
    expect(screen.getByRole("heading", { name: "Chưa có ảnh được chọn" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem cách đưa ảnh từ iPhone" })).toHaveAttribute("href", "/huong-dan#iphone-title");
  });
});
