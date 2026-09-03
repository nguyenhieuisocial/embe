import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PregnancyHealthCharts, { type PregnancyHealthMetric } from "../src/components/pregnancy-health-charts";

const metric: PregnancyHealthMetric = {
  day: "2026-09-03", weightKg: 56, systolic: null, diastolic: null,
  sleepMinutes: null, waterGlasses: null, movementMinutes: null, wellbeing: null,
  bloodGlucoseMgDl: null, fetalMovementCount: null, symptoms: [], glucoseContext: null,
  healthNote: "", checklistPercent: 0
};

describe("pregnancy health charts", () => {
  it("explains the clinician-confirmed total pregnancy weight target", () => {
    render(<PregnancyHealthCharts history={[metric]} weightPlan={{
      prePregnancyWeightKg: 52,
      clinicianGainMinKg: 8,
      clinicianGainMaxKg: 12
    }} />);

    expect(screen.getByText("Đã tăng 4 kg")).toBeInTheDocument();
    expect(screen.getByText("Mục tiêu cả thai kỳ do bác sĩ đặt: 8–12 kg.")).toBeInTheDocument();
  });
});
