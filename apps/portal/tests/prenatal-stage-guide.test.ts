import { describe, expect, it } from "vitest";

import { prenatalStageGuide } from "../src/lib/prenatal-stage-guide";

describe("prenatalStageGuide", () => {
  it("changes practical guidance with the trimester", () => {
    expect(prenatalStageGuide(8).partner).toContain("lịch khám");
    expect(prenatalStageGuide(20).movement).toContain("yoga bầu");
    expect(prenatalStageGuide(32).partner).toContain("giỏ đi sinh");
  });

  it("does not promise fetal response or healing claims", () => {
    const text = Object.values(prenatalStageGuide(30)).join(" ").toLocaleLowerCase("vi-VN");
    expect(text).not.toContain("chữa lành");
    expect(text).not.toContain("tần số");
    expect(text).toContain("không cần cố");
  });
});
