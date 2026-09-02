"use client";

import { useMemo, useState } from "react";
import {
  WHO_GROWTH_PROVENANCE,
  sampleWhoGrowthSeries,
  type WhoGrowthMetric,
  type WhoGrowthSex
} from "../lib/who-growth-reference";

type GrowthEntry = {
  id: string;
  measured_at: string;
  weight_g: number | null;
  length_cm: number | null;
  head_cm: number | null;
};

type Props = {
  birthOccurredAt: string | null;
  babySex: WhoGrowthSex | null;
  premature?: boolean;
  growth: GrowthEntry[];
};

const metrics: Record<WhoGrowthMetric, { label: string; unit: string }> = {
  weight: { label: "Cân nặng", unit: "kg" },
  length: { label: "Chiều dài", unit: "cm" },
  head: { label: "Vòng đầu", unit: "cm" }
};

const WIDTH = 320;
const HEIGHT = 154;
const PAD = { top: 12, right: 12, bottom: 24, left: 36 };

function ageInDays(measuredAt: string, birthOccurredAt: string): number | null {
  const measured = new Date(measuredAt).getTime();
  const born = new Date(birthOccurredAt).getTime();
  if (!Number.isFinite(measured) || !Number.isFinite(born)) return null;
  const days = Math.floor((measured - born) / 86_400_000);
  return days >= 0 && days <= 1856 ? days : null;
}

function pathFor(
  points: Array<{ ageDays: number; value: number }>,
  x: (value: number) => number,
  y: (value: number) => number
): string {
  return points.map((point, index) => `${index ? "L" : "M"}${x(point.ageDays).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
}

export default function BabyGrowthChart({ birthOccurredAt, babySex, premature = false, growth }: Props) {
  const [metric, setMetric] = useState<WhoGrowthMetric>("weight");
  const ageOutsideReference = Boolean(birthOccurredAt && ageInDays(new Date().toISOString(), birthOccurredAt) === null);
  const model = useMemo(() => {
    if (!birthOccurredAt || !babySex || ageOutsideReference) return null;
    const todayAge = ageInDays(new Date().toISOString(), birthOccurredAt)!;
    const observations = growth.flatMap((entry) => {
      const ageDays = ageInDays(entry.measured_at, birthOccurredAt);
      const raw = metric === "weight" ? (entry.weight_g === null ? null : entry.weight_g / 1000)
        : metric === "length" ? entry.length_cm : entry.head_cm;
      return ageDays === null || raw === null ? [] : [{ id: entry.id, ageDays, value: raw }];
    }).sort((a, b) => a.ageDays - b.ageDays);
    const maximumAge = Math.min(1856, Math.max(1, todayAge, ...observations.map((item) => item.ageDays)));
    const reference = sampleWhoGrowthSeries(babySex, metric, maximumAge, 40);
    const values = [...reference.flatMap((point) => [point.low, point.high]), ...observations.map((item) => item.value)];
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const spread = Math.max(1, maximum - minimum);
    const low = minimum - spread * 0.08;
    const high = maximum + spread * 0.08;
    const x = (value: number) => PAD.left + (value / maximumAge) * (WIDTH - PAD.left - PAD.right);
    const y = (value: number) => PAD.top + ((high - value) / (high - low)) * (HEIGHT - PAD.top - PAD.bottom);
    return { observations, reference, maximumAge, low, high, x, y };
  }, [ageOutsideReference, babySex, birthOccurredAt, growth, metric]);

  return <section className="section baby-growth-card" aria-labelledby="growth-chart-title">
    <div className="baby-growth-heading">
      <div><h2 id="growth-chart-title">Đường lớn của Bé</h2><p>So với vùng tham khảo WHO</p></div>
      <span>{metrics[metric].unit}</span>
    </div>
    <div className="baby-growth-tabs" aria-label="Chọn chỉ số tăng trưởng">
      {(Object.keys(metrics) as WhoGrowthMetric[]).map((key) => <button type="button" key={key} aria-pressed={metric === key} onClick={() => setMetric(key)}>{metrics[key].label}</button>)}
    </div>
    {ageOutsideReference ? <p className="baby-growth-empty">Vùng tham khảo này chỉ dùng cho giai đoạn từ lúc sinh đến 5 tuổi.</p> : !model ? <p className="baby-growth-empty">Lưu ngày sinh và giới tính của Bé để mở vùng tham khảo WHO.</p> : <>
      <svg className="baby-growth-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${metrics[metric].label} của Bé và vùng tham khảo WHO`}>
        <title>{metrics[metric].label} của Bé và vùng tham khảo WHO theo tuổi</title>
        <path className="growth-band" d={`${pathFor([
          ...model.reference.map((p) => ({ ageDays: p.ageDays, value: p.low })),
          ...[...model.reference].reverse().map((p) => ({ ageDays: p.ageDays, value: p.high }))
        ], model.x, model.y)} Z`} />
        <path className="growth-median" d={pathFor(model.reference.map((p) => ({ ageDays: p.ageDays, value: p.median })), model.x, model.y)} />
        {model.observations.length > 1 ? <path className="growth-observation-line" d={pathFor(model.observations, model.x, model.y)} /> : null}
        {model.observations.map((point) => <circle className="growth-observation" key={point.id} cx={model.x(point.ageDays)} cy={model.y(point.value)} r="4" />)}
        <text x={PAD.left} y={HEIGHT - 6}>Lúc sinh</text><text textAnchor="end" x={WIDTH - PAD.right} y={HEIGHT - 6}>{model.maximumAge < 61 ? `${model.maximumAge} ngày` : `${Math.floor(model.maximumAge / 30.4375)} tháng`}</text>
        <text textAnchor="end" x={PAD.left - 5} y={model.y(model.high) + 4}>{model.high.toFixed(1)}</text><text textAnchor="end" x={PAD.left - 5} y={model.y(model.low) + 4}>{model.low.toFixed(1)}</text>
      </svg>
      <div className="baby-growth-legend"><span><i className="who-band-swatch" />Vùng -2 đến +2 z-score</span><span><i className="baby-dot-swatch" />Số đo của Bé</span></div>
      {premature ? <p className="baby-growth-note">Bé sinh sớm: hãy hỏi bác sĩ nên dùng tuổi hiệu chỉnh đến khi nào.</p> : null}
    </>}
    <p className="baby-growth-source"><a href={WHO_GROWTH_PROVENANCE.sourceUrl} target="_blank" rel="noreferrer">{WHO_GROWTH_PROVENANCE.datasetVersion}</a> · dữ liệu theo ngày, phiên bản đã khóa.</p>
    <small>Vùng tham khảo giúp nhìn xu hướng, không phải chẩn đoán. Một lần đo riêng lẻ không thay cho đánh giá của bác sĩ.</small>
  </section>;
}
