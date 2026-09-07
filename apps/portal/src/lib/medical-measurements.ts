import type { MedicalRecord } from "./pregnancy-medical";

// Units are part of each identifier. Limits catch typing errors, not clinical normality.
export const MEDICAL_MEASUREMENTS = [
  { key: "weightKg", label: "Cân nặng Mẹ", unit: "kg", group: "Số đo khi khám", max: 300 },
  { key: "systolic", label: "Huyết áp tâm thu", unit: "mmHg", group: "Số đo khi khám", max: 350 },
  { key: "diastolic", label: "Huyết áp tâm trương", unit: "mmHg", group: "Số đo khi khám", max: 250 },
  { key: "fetalHeartRate", label: "Nhịp tim thai", unit: "lần/phút", group: "Siêu âm", max: 300 },
  { key: "crlMm", label: "CRL — chiều dài đầu mông", unit: "mm", group: "Siêu âm", max: 250 },
  { key: "ntMm", label: "NT — độ mờ da gáy", unit: "mm", group: "Siêu âm", max: 30 },
  { key: "bpdMm", label: "BPD — đường kính lưỡng đỉnh", unit: "mm", group: "Siêu âm", max: 200 },
  { key: "hcMm", label: "HC — chu vi đầu", unit: "mm", group: "Siêu âm", max: 600 },
  { key: "acMm", label: "AC — chu vi bụng", unit: "mm", group: "Siêu âm", max: 600 },
  { key: "flMm", label: "FL — chiều dài xương đùi", unit: "mm", group: "Siêu âm", max: 150 },
  { key: "efwG", label: "EFW — cân nặng ước tính", unit: "g", group: "Siêu âm", max: 10000 },
  { key: "afiCm", label: "AFI — chỉ số ối", unit: "cm", group: "Siêu âm", max: 100 },
  { key: "cervixMm", label: "Chiều dài cổ tử cung", unit: "mm", group: "Siêu âm", max: 150 },
  { key: "hemoglobinGdl", label: "Hemoglobin", unit: "g/dL", group: "Xét nghiệm", max: 30 },
  { key: "ferritinNgml", label: "Ferritin", unit: "ng/mL", group: "Xét nghiệm", max: 10000 },
  { key: "platelet109l", label: "Tiểu cầu", unit: "10⁹/L", group: "Xét nghiệm", max: 3000 },
  { key: "glucoseMgdl", label: "Đường huyết", unit: "mg/dL", group: "Xét nghiệm", max: 1500 },
  { key: "glucoseMmoll", label: "Đường huyết", unit: "mmol/L", group: "Xét nghiệm", max: 85 },
  { key: "hba1cPercent", label: "HbA1c", unit: "%", group: "Xét nghiệm", max: 25 },
  { key: "tshMiuL", label: "TSH", unit: "mIU/L", group: "Xét nghiệm", max: 1000 },
  { key: "ft4PmolL", label: "FT4", unit: "pmol/L", group: "Xét nghiệm", max: 200 },
  { key: "astUL", label: "AST", unit: "U/L", group: "Xét nghiệm", max: 10000 },
  { key: "altUL", label: "ALT", unit: "U/L", group: "Xét nghiệm", max: 10000 }
] as const;

export function validMedicalMeasurements(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 64) return false;
  return Object.entries(value).every(([key, n]) => /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)
    && typeof n === "number" && Number.isFinite(n) && n >= 0
    && n <= (MEDICAL_MEASUREMENTS.find(metric => metric.key === key)?.max ?? 10000));
}

export function medicalMeasurementSeries(records: MedicalRecord[], key: string) {
  if (!MEDICAL_MEASUREMENTS.some(metric => metric.key === key)) return [];
  return records.filter(record => record.status === "completed" && Number.isFinite(Date.parse(record.occurredAt)) && Number.isFinite(record.measurements[key]))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .map(record => ({ id: record.id, at: record.occurredAt, value: record.measurements[key], provider: record.provider, week: record.gestationalWeek, dateOnly: Boolean(record.documentDateOnly) }));
}
