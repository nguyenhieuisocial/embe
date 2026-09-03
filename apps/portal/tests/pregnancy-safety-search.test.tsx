import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PregnancySafetySearch from "../src/components/pregnancy-safety-search";

describe("PregnancySafetySearch", () => {
  it("searches Vietnamese guidance without requiring accents", () => {
    render(<PregnancySafetySearch />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ca phe" } });
    expect(screen.getByText(/Caffeine không quá 200 mg/)).toBeInTheDocument();
  });

  it("shows a safe fallback when the local guide has no match", () => {
    render(<PregnancySafetySearch />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "món chưa biết" } });
    expect(screen.getByText(/Đừng tự kết luận an toàn/)).toBeInTheDocument();
  });
});
