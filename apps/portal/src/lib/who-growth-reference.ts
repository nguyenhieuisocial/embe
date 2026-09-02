import {
  WHO_GROWTH_LMS,
  type WhoGrowthMetric,
  type WhoGrowthSex,
  type WhoLmsRow
} from "./who-growth-data.generated";

export type { WhoGrowthMetric, WhoGrowthSex };
export type WhoGrowthBand = { low: number; median: number; high: number };
export type WhoGrowthChartPoint = WhoGrowthBand & { ageDays: number };

export const WHO_GROWTH_PROVENANCE = Object.freeze({
  datasetVersion: "WHO Child Growth Standards 2006",
  algorithmVersion: "embe-who-band-v1",
  sourceRepository: "WorldHealthOrganization/anthro",
  sourceCommit: "b776d8a12b1c97369c748b561159fd2ec4f4db58",
  sourceUrl: "https://www.who.int/tools/child-growth-standards/standards",
  sourceLicense: "GPL-3.0",
  sourceChecksums: [
    "bc15a6a623dd1d5beaeed1497666332aa54bc4ccd15ff9658c487d79694ab77b",
    "709f7a11881451daf7820f022d363d5bdb93746b5361d6bd9218af6ff838e0c2",
    "e794e46f06b91223ad2c6435148dc08794a1d75b67613a652c3151201a98bf7c"
  ]
});

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function valueAtZ([, l, m, s]: WhoLmsRow, z: number): number {
  if (l === 0) return m * Math.exp(s * z);
  return m * Math.pow(1 + l * s * z, 1 / l);
}

export function getWhoGrowthBand(
  sex: WhoGrowthSex,
  metric: WhoGrowthMetric,
  ageDays: number
): WhoGrowthBand | null {
  if (!Number.isInteger(ageDays) || ageDays < 0 || ageDays > 1856) return null;
  const row = WHO_GROWTH_LMS[sex][metric][ageDays];
  if (!row || row[0] !== ageDays) return null;
  return {
    low: rounded(valueAtZ(row, -2)),
    median: rounded(row[2]),
    high: rounded(valueAtZ(row, 2))
  };
}

export function sampleWhoGrowthSeries(
  sex: WhoGrowthSex,
  metric: WhoGrowthMetric,
  maximumAgeDays: number,
  maximumPoints = 36
): WhoGrowthChartPoint[] {
  const lastDay = Math.min(1856, Math.max(0, Math.floor(maximumAgeDays)));
  const pointLimit = Math.min(120, Math.max(2, Math.floor(maximumPoints)));
  const step = Math.max(1, Math.ceil(lastDay / (pointLimit - 1)));
  const days = Array.from({ length: Math.floor(lastDay / step) + 1 }, (_, index) => index * step);
  if (days.at(-1) !== lastDay) days.push(lastDay);
  return days.flatMap((ageDays) => {
    const band = getWhoGrowthBand(sex, metric, ageDays);
    return band ? [{ ageDays, ...band }] : [];
  });
}
