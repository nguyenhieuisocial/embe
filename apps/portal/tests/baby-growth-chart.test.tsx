import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BabyGrowthChart from "../src/components/baby-growth-chart";

describe("BabyGrowthChart", () => {
  it("shows a compact WHO reference chart with provenance and safety copy", () => {
    render(<BabyGrowthChart
      birthOccurredAt="2026-01-01T00:00:00.000Z"
      babySex="female"
      growth={[{ id: "one", measured_at: "2026-02-01T00:00:00.000Z", weight_g: 4200, length_cm: 54, head_cm: 36 }]}
    />);

    expect(screen.getByRole("img", { name: /cân nặng của Bé và vùng tham khảo WHO/i })).toBeInTheDocument();
    expect(screen.getByText(/WHO Child Growth Standards 2006/i)).toBeInTheDocument();
    expect(screen.getByText(/không phải chẩn đoán/i)).toBeInTheDocument();
    expect(screen.queryByText(/percentile/i)).not.toBeInTheDocument();
    const bandPath = document.querySelector("path.growth-band")?.getAttribute("d") ?? "";
    expect(bandPath.match(/M/g)).toHaveLength(1);
  });

  it("does not draw a reference when birth date or sex is missing", () => {
    render(<BabyGrowthChart birthOccurredAt={null} babySex={null} growth={[]} />);
    expect(screen.getByText(/lưu ngày sinh và giới tính/i)).toBeInTheDocument();
  });

  it("does not reset an out-of-range age to birth", () => {
    render(<BabyGrowthChart birthOccurredAt="2010-01-01T00:00:00.000Z" babySex="female" growth={[]} />);
    expect(screen.getByText(/chỉ dùng cho giai đoạn từ lúc sinh đến 5 tuổi/i)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
