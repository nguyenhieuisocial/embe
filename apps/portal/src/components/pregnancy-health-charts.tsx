"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export type PregnancyHealthMetric = {
  day: string;
  weightKg: number | null;
  systolic: number | null;
  diastolic: number | null;
  sleepMinutes: number | null;
  waterGlasses: number | null;
  movementMinutes: number | null;
  wellbeing: number | null;
  bloodGlucoseMgDl: number | null;
  fetalMovementCount: number | null;
  symptoms: string[];
  glucoseContext: "fasting" | "after_1h" | "after_2h" | "other" | null;
  healthNote: string;
  checklistPercent: number;
  waterMl?: number | null;
  metricSources?: Partial<Record<"weightKg" | "bloodPressure" | "sleepMinutes" | "waterMl", "manual" | "iphone">>;
  metricSyncedAt?: Record<string, string>;
};

type ChartKey = keyof Omit<PregnancyHealthMetric, "day">;

export type PregnancyWeightPlan = {
  prePregnancyWeightKg: number | null;
  clinicianGainMinKg: number | null;
  clinicianGainMaxKg: number | null;
};

function shortDay(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

function latestValue(history: PregnancyHealthMetric[], key: ChartKey): number | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const value = history[index][key];
    if (typeof value === "number") return value;
  }
  return null;
}

function ChartCard({
  title,
  summary,
  note,
  children
}: {
  title: string;
  summary: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="health-chart-card">
      <figcaption>
        <strong>{title}</strong>
        <span>{summary}</span>
      </figcaption>
      {note ? <p className="health-chart-note">{note}</p> : null}
      <div className="health-chart-canvas">{children}</div>
    </figure>
  );
}

const axis = { fill: "#6d746f", fontSize: 11 };
const tooltipStyle = {
  background: "#fff",
  border: "1px solid #dfe6e1",
  borderRadius: 12,
  fontSize: 12
};

export default function PregnancyHealthCharts({
  history,
  weightPlan
}: {
  history: PregnancyHealthMetric[];
  weightPlan?: PregnancyWeightPlan;
}) {
  const data = history.map((item) => ({
    ...item,
    label: shortDay(item.day),
    sleepHours: item.sleepMinutes === null ? null : Number((item.sleepMinutes / 60).toFixed(1))
  }));
  const weight = latestValue(history, "weightKg");
  const systolic = latestValue(history, "systolic");
  const diastolic = latestValue(history, "diastolic");
  const sleepMinutes = latestValue(history, "sleepMinutes");
  const water = latestValue(history, "waterGlasses");
  const movement = latestValue(history, "movementMinutes");
  const wellbeing = latestValue(history, "wellbeing");
  const glucose = latestValue(history, "bloodGlucoseMgDl");
  const fetalMovement = latestValue(history, "fetalMovementCount");
  const checklist = latestValue(history, "checklistPercent");
  const hasWeightPlan = typeof weightPlan?.prePregnancyWeightKg === "number"
    && typeof weightPlan.clinicianGainMinKg === "number"
    && typeof weightPlan.clinicianGainMaxKg === "number";
  const weightGain = weight !== null && typeof weightPlan?.prePregnancyWeightKg === "number"
    ? Number((weight - weightPlan.prePregnancyWeightKg).toFixed(1))
    : null;
  const targetMinimum = hasWeightPlan
    ? Number(weightPlan.prePregnancyWeightKg) + Number(weightPlan.clinicianGainMinKg)
    : null;
  const targetMaximum = hasWeightPlan
    ? Number(weightPlan.prePregnancyWeightKg) + Number(weightPlan.clinicianGainMaxKg)
    : null;

  return (
    <div className="health-chart-scroll" aria-label="Các biểu đồ sức khỏe 28 ngày">
      <ChartCard
        title="Cân nặng"
        summary={weightGain === null ? (weight === null ? "Chưa ghi" : `${weight} kg`) : `Đã tăng ${weightGain.toLocaleString("vi-VN")} kg`}
        note={hasWeightPlan ? `Mục tiêu cả thai kỳ do bác sĩ đặt: ${weightPlan.clinicianGainMinKg}–${weightPlan.clinicianGainMaxKg} kg.` : undefined}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#edf1ee" vertical={false} />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis tick={axis} tickLine={false} axisLine={false} domain={["dataMin - 1", "dataMax + 1"]} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} kg`, "Cân nặng"]} />
            {targetMinimum !== null ? <ReferenceLine y={targetMinimum} stroke="#c58ca0" strokeDasharray="4 4" ifOverflow="extendDomain" /> : null}
            {targetMaximum !== null ? <ReferenceLine y={targetMaximum} stroke="#c58ca0" strokeDasharray="4 4" ifOverflow="extendDomain" /> : null}
            <Line type="monotone" dataKey="weightKg" stroke="#17624a" strokeWidth={3} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Huyết áp" summary={systolic === null || diastolic === null ? "Chưa ghi" : `${systolic}/${diastolic} mmHg`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#edf1ee" vertical={false} />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis tick={axis} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line name="Tâm thu" type="monotone" dataKey="systolic" stroke="#17624a" strokeWidth={3} dot={false} connectNulls />
            <Line name="Tâm trương" type="monotone" dataKey="diastolic" stroke="#d96c50" strokeWidth={3} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Giấc ngủ" summary={sleepMinutes === null ? "Chưa ghi" : `${(sleepMinutes / 60).toFixed(1)} giờ`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#edf1ee" vertical={false} />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis tick={axis} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} giờ`, "Giấc ngủ"]} />
            <Bar dataKey="sleepHours" fill="#7f9f94" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Nước uống" summary={water === null ? "Chưa ghi" : `${water} cốc`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#edf1ee" vertical={false} />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} cốc`, "Nước"]} />
            <Bar dataKey="waterGlasses" fill="#6b9fc7" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Vận động" summary={movement === null ? "Chưa ghi" : `${movement} phút`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#edf1ee" vertical={false} />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis tick={axis} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} phút`, "Vận động"]} />
            <Bar dataKey="movementMinutes" fill="#d19b52" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Cảm nhận" summary={wellbeing === null ? "Chưa ghi" : `${wellbeing}/5`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#edf1ee" vertical={false} />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis tick={axis} tickLine={false} axisLine={false} domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value}/5`, "Cảm nhận"]} />
            <Line type="monotone" dataKey="wellbeing" stroke="#986aa6" strokeWidth={3} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Đường huyết đã đo" summary={glucose === null ? "Chưa ghi" : `${glucose} mg/dL`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#edf1ee" vertical={false} />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis tick={axis} tickLine={false} axisLine={false} domain={["dataMin - 10", "dataMax + 10"]} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} mg/dL`, "Đường huyết"]} />
            <Line type="monotone" dataKey="bloodGlucoseMgDl" stroke="#b86d81" strokeWidth={3} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Cử động thai đã ghi" summary={fetalMovement === null ? "Chưa ghi" : `${fetalMovement} lần`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#edf1ee" vertical={false} />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} lần`, "Cử động thai"]} />
            <Bar dataKey="fetalMovementCount" fill="#c58ca0" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Checklist hằng ngày" summary={checklist === null ? "Chưa ghi" : `${checklist}%`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#edf1ee" vertical={false} />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis tick={axis} tickLine={false} axisLine={false} domain={[0, 100]} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value}%`, "Checklist"]} />
            <Bar dataKey="checklistPercent" fill="#17624a" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
