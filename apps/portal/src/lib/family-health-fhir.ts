import type { FamilyBookReport } from "./family-book-pdf";

type FhirResource = Record<string, unknown>;

export type FamilyHealthFhirBundle = {
  resourceType: "Bundle";
  type: "collection";
  timestamp: string;
  entry: Array<{ resource: FhirResource }>;
};

const LOINC = "http://loinc.org";
const UCUM = "http://unitsofmeasure.org";
const VITAL_SIGNS = {
  coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs" }]
};

function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function bounded(value: number | null | undefined, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function code(codeValue: string, display: string): Record<string, unknown> {
  return { coding: [{ system: LOINC, code: codeValue, display }], text: display };
}

function quantity(value: number, unit: string, ucumCode: string): Record<string, unknown> {
  return { value, unit, system: UCUM, code: ucumCode };
}

function observation(input: {
  id: string;
  subject: "mother" | "baby";
  effectiveDateTime: string;
  loinc: string;
  display: string;
  value?: Record<string, unknown>;
  component?: Array<Record<string, unknown>>;
}): FhirResource {
  return {
    resourceType: "Observation",
    id: input.id,
    status: "final",
    category: [VITAL_SIGNS],
    code: code(input.loinc, input.display),
    subject: { reference: `Patient/${input.subject}` },
    effectiveDateTime: input.effectiveDateTime,
    ...(input.value ? { valueQuantity: input.value } : {}),
    ...(input.component ? { component: input.component } : {})
  };
}

export function buildFamilyHealthFhirBundle(
  data: FamilyBookReport,
  generatedAt = new Date()
): FamilyHealthFhirBundle {
  const mother: FhirResource[] = [];
  const baby: FhirResource[] = [];

  for (const health of data.health) {
    if (!validDay(health.day)) continue;
    const effectiveDateTime = `${health.day}T12:00:00+07:00`;
    if (bounded(health.weightKg, 25, 300)) {
      mother.push(observation({
        id: `mother-weight-${health.day}`, subject: "mother", effectiveDateTime,
        loinc: "29463-7", display: "Body weight", value: quantity(health.weightKg, "kg", "kg")
      }));
    }
    if (bounded(health.systolic, 50, 260) && bounded(health.diastolic, 30, 180)) {
      mother.push(observation({
        id: `mother-bp-${health.day}`, subject: "mother", effectiveDateTime,
        loinc: "85354-9", display: "Blood pressure panel",
        component: [
          { code: code("8480-6", "Systolic blood pressure"), valueQuantity: quantity(health.systolic, "mmHg", "mm[Hg]") },
          { code: code("8462-4", "Diastolic blood pressure"), valueQuantity: quantity(health.diastolic, "mmHg", "mm[Hg]") }
        ]
      }));
    }
  }

  for (const growth of data.growth ?? []) {
    const measured = new Date(growth.measured_at);
    if (Number.isNaN(measured.getTime())) continue;
    const effectiveDateTime = measured.toISOString();
    if (bounded(growth.weight_g, 300, 40_000)) {
      baby.push(observation({
        id: `baby-weight-${growth.id}`, subject: "baby", effectiveDateTime,
        loinc: "29463-7", display: "Body weight", value: quantity(growth.weight_g / 1000, "kg", "kg")
      }));
    }
    if (bounded(growth.length_cm, 20, 130)) {
      baby.push(observation({
        id: `baby-length-${growth.id}`, subject: "baby", effectiveDateTime,
        loinc: "8302-2", display: "Body height", value: quantity(growth.length_cm, "cm", "cm")
      }));
    }
    if (bounded(growth.head_cm, 20, 65)) {
      baby.push(observation({
        id: `baby-head-${growth.id}`, subject: "baby", effectiveDateTime,
        loinc: "9843-4", display: "Head circumference", value: quantity(growth.head_cm, "cm", "cm")
      }));
    }
  }

  const resources: FhirResource[] = [];
  if (mother.length) resources.push({ resourceType: "Patient", id: "mother" }, ...mother);
  if (baby.length) resources.push({
    resourceType: "Patient", id: "baby",
    ...(data.lifecycle?.babySex === "male" || data.lifecycle?.babySex === "female"
      ? { gender: data.lifecycle.babySex } : {})
  }, ...baby);
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: generatedAt.toISOString(),
    entry: resources.map((resource) => ({ resource }))
  };
}

export function downloadFamilyHealthFhir(data: FamilyBookReport): void {
  const bundle = buildFamilyHealthFhirBundle(data);
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/fhir+json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `embe-suc-khoe-fhir-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
