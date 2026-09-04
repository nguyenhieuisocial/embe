export const MEDICATION_SCAN_STATUSES = new Set([
  "queued", "processing", "review", "confirmed", "failed", "rejected"
]);

export type MedicationScanMedicine = {
  name: string;
  ingredients?: string;
  dose: string;
  frequency: string;
  instructions: string;
  confidence?: number;
};

export type MedicationScanAnalysis = {
  medicines: MedicationScanMedicine[];
  questions: string[];
};

function text(value: unknown, maximum: number, required = false): string | null {
  if (typeof value !== "string" || value.length > maximum) return null;
  const normalized = value.trim();
  return required && !normalized ? null : normalized;
}

export function normalizeMedicationScanAnalysis(value: unknown): MedicationScanAnalysis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["medicines", "questions"].includes(key))
      || !Array.isArray(input.medicines) || input.medicines.length > 12
      || !Array.isArray(input.questions) || input.questions.length > 12) return null;
  const medicines = input.medicines.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const medicine = item as Record<string, unknown>;
    if (Object.keys(medicine).some((key) => !["name", "ingredients", "dose", "frequency", "instructions", "confidence"].includes(key))) return [];
    const name = text(medicine.name, 100, true);
    const ingredients = text(medicine.ingredients ?? "", 300);
    const dose = text(medicine.dose, 80);
    const frequency = text(medicine.frequency, 80);
    const instructions = text(medicine.instructions, 200);
    const confidence = medicine.confidence;
    if (!name || ingredients === null || dose === null || frequency === null || instructions === null
        || (confidence !== undefined && (typeof confidence !== "number" || confidence < 0 || confidence > 1))) return [];
    return [{ name, ingredients, dose, frequency, instructions, ...(typeof confidence === "number" ? { confidence } : {}) }];
  });
  const questions = input.questions.flatMap((item) => {
    const question = text(item, 160, true);
    return question ? [question] : [];
  });
  if (medicines.length !== input.medicines.length || questions.length !== input.questions.length) return null;
  return { medicines, questions };
}

export function confirmedMedicationPayload(value: unknown): { medicines: MedicationScanMedicine[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "medicines")) return null;
  const analysis = normalizeMedicationScanAnalysis({ medicines: input.medicines, questions: [] });
  if (!analysis || !analysis.medicines.length) return null;
  return { medicines: analysis.medicines.map(({ name, ingredients, dose, frequency, instructions }) => ({
    name, ingredients: ingredients ?? "", dose, frequency, instructions
  })) };
}
