import { describe, expect, it } from "vitest";
import {
  WHO_GROWTH_PROVENANCE,
  getWhoGrowthBand,
  sampleWhoGrowthSeries
} from "../src/lib/who-growth-reference";

describe("WHO child growth reference", () => {
  it("matches the official birth fixtures without estimating a percentile", () => {
    expect(getWhoGrowthBand("female", "weight", 0)).toEqual({ low: 2.395, median: 3.232, high: 4.23 });
    expect(getWhoGrowthBand("male", "length", 0)).toEqual({ low: 46.098, median: 49.884, high: 53.67 });
    expect(getWhoGrowthBand("female", "head", 0)).toEqual({ low: 31.51, median: 33.879, high: 36.247 });
  });

  it("uses an exact day from the official expanded table", () => {
    expect(getWhoGrowthBand("female", "weight", 365)).toEqual({ low: 7.041, median: 8.946, high: 11.506 });
  });

  it("refuses ages outside the WHO birth-to-five-year table", () => {
    expect(getWhoGrowthBand("male", "weight", -1)).toBeNull();
    expect(getWhoGrowthBand("male", "weight", 1857)).toBeNull();
  });

  it("returns a bounded chart series and always includes the requested last day", () => {
    const series = sampleWhoGrowthSeries("male", "weight", 46, 24);
    expect(series.at(0)?.ageDays).toBe(0);
    expect(series.at(-1)?.ageDays).toBe(46);
    expect(series.length).toBeLessThanOrEqual(24);
  });

  it("publishes immutable source and algorithm provenance", () => {
    expect(WHO_GROWTH_PROVENANCE.datasetVersion).toBe("WHO Child Growth Standards 2006");
    expect(WHO_GROWTH_PROVENANCE.algorithmVersion).toBe("embe-who-band-v1");
    expect(WHO_GROWTH_PROVENANCE.sourceUrl).toMatch(/^https:\/\/www\.who\.int\//);
    expect(WHO_GROWTH_PROVENANCE.sourceChecksums).toHaveLength(3);
  });
});
