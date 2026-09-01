import { createHash, randomBytes } from "node:crypto";

import { authorizeMutation, photoStore, privateReply } from "../../../../lib/photo-upload-server";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const METRIC_RULES = {
  steps: [0, 200000, true], activeEnergyKcal: [0, 10000, false], restingEnergyKcal: [0, 10000, false],
  sleepMinutes: [0, 1440, true], weightKg: [25, 300, false], heightCm: [80, 230, false],
  distanceM: [0, 200000, false], waterMl: [0, 15000, true], heartRateAvg: [25, 240, false],
  restingHeartRateBpm: [25, 240, false], respiratoryRate: [4, 60, false],
  oxygenSaturationPercent: [50, 100, false], bodyTemperatureC: [30, 45, false],
  wristTemperatureC: [25, 45, false], hrvMs: [0, 500, false], exerciseMinutes: [0, 1440, true],
  mindfulnessMinutes: [0, 1440, true], systolic: [60, 250, true], diastolic: [30, 160, true]
} as const;
type MetricName = keyof typeof METRIC_RULES;
type MetricValues = Record<MetricName, number | null>;

function emptyMetrics(): MetricValues {
  return Object.fromEntries(Object.keys(METRIC_RULES).map((key) => [key, null])) as MetricValues;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function bearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return /^embe_health_[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

function metric(value: unknown, low: number, high: number, integer = false): number | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high || (integer && !Number.isInteger(value))) return undefined;
  return value;
}

function parsedMetrics(body: Record<string, unknown>): MetricValues | null {
  const result = emptyMetrics();
  for (const [key, [low, high, integer]] of Object.entries(METRIC_RULES) as [MetricName, readonly [number, number, boolean]][]) {
    const value = metric(body[key], low, high, integer);
    if (value === undefined) return null;
    result[key] = value;
  }
  return result;
}

function rpcInput(token: string, day: string, values: MetricValues): Record<string, unknown> {
  return {
    p_token_hash: hashToken(token), p_day: day, p_steps: values.steps,
    p_active_energy_kcal: values.activeEnergyKcal, p_resting_energy_kcal: values.restingEnergyKcal,
    p_sleep_minutes: values.sleepMinutes, p_weight_kg: values.weightKg, p_height_cm: values.heightCm,
    p_distance_m: values.distanceM, p_water_ml: values.waterMl, p_heart_rate_avg: values.heartRateAvg,
    p_resting_heart_rate_bpm: values.restingHeartRateBpm, p_respiratory_rate: values.respiratoryRate,
    p_oxygen_saturation_percent: values.oxygenSaturationPercent, p_body_temperature_c: values.bodyTemperatureC,
    p_wrist_temperature_c: values.wristTemperatureC, p_hrv_ms: values.hrvMs,
    p_exercise_minutes: values.exerciseMinutes, p_mindfulness_minutes: values.mindfulnessMinutes,
    p_systolic: values.systolic, p_diastolic: values.diastolic
  };
}

function shortcutMetric(type: string, amount: number, unit: string): { key: MetricName; amount: number; additive: boolean } | null {
  if (type === "Steps" && unit === "count") return { key: "steps", amount, additive: true };
  if (type === "Active Calories" && ["kcal", "kJ"].includes(unit)) return { key: "activeEnergyKcal", amount: unit === "kJ" ? amount / 4.184 : amount, additive: true };
  if (["Basal Energy Burned", "Resting Energy"].includes(type) && ["kcal", "kJ"].includes(unit)) return { key: "restingEnergyKcal", amount: unit === "kJ" ? amount / 4.184 : amount, additive: true };
  if (type === "Sleep" && ["min", "hr", "h"].includes(unit)) return { key: "sleepMinutes", amount: unit === "min" ? amount : amount * 60, additive: true };
  if (type === "Weight" && ["kg", "lb"].includes(unit)) return { key: "weightKg", amount: unit === "lb" ? amount * .45359237 : amount, additive: false };
  if (type === "Height" && ["cm", "m", "in"].includes(unit)) return { key: "heightCm", amount: unit === "m" ? amount * 100 : unit === "in" ? amount * 2.54 : amount, additive: false };
  if (["Walking + Running Distance", "Distance"].includes(type) && ["m", "km", "mi"].includes(unit)) return { key: "distanceM", amount: unit === "km" ? amount * 1000 : unit === "mi" ? amount * 1609.344 : amount, additive: true };
  if (type === "Water" && ["mL", "ml", "L"].includes(unit)) return { key: "waterMl", amount: unit === "L" ? amount * 1000 : amount, additive: true };
  if (type === "Heart Rate" && unit === "bpm") return { key: "heartRateAvg", amount, additive: false };
  if (type === "Resting Heart Rate" && unit === "bpm") return { key: "restingHeartRateBpm", amount, additive: false };
  if (type === "Respiratory Rate" && ["count/min", "breaths/min"].includes(unit)) return { key: "respiratoryRate", amount, additive: false };
  if (type === "Blood Oxygen" && unit === "%") return { key: "oxygenSaturationPercent", amount: amount <= 1.2 ? amount * 100 : amount, additive: false };
  if (["Body Temperature", "Wrist Temperature"].includes(type) && ["degC", "°C", "degF", "°F"].includes(unit)) return {
    key: type === "Wrist Temperature" ? "wristTemperatureC" : "bodyTemperatureC",
    amount: ["degF", "°F"].includes(unit) ? (amount - 32) * 5 / 9 : amount, additive: false
  };
  if (["Heart Rate Variability", "HRV"].includes(type) && unit === "ms") return { key: "hrvMs", amount, additive: false };
  if (type === "Exercise Time" && unit === "min") return { key: "exerciseMinutes", amount, additive: true };
  if (["Mindful Minutes", "Mindfulness"].includes(type) && unit === "min") return { key: "mindfulnessMinutes", amount, additive: true };
  if (type === "Blood Pressure Systolic" && unit === "mmHg") return { key: "systolic", amount, additive: false };
  if (type === "Blood Pressure Diastolic" && unit === "mmHg") return { key: "diastolic", amount, additive: false };
  return null;
}

async function ingestShortcutExport(request: Request, token: string): Promise<Response> {
  let input: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 262144) return privateReply({ error: "invalid_request" }, 413);
    input = JSON.parse(raw);
  } catch { return privateReply({ error: "invalid_request" }, 400); }
  if (!input || typeof input !== "object" || !Array.isArray((input as Record<string, unknown>).data)
      || Object.keys(input).some((key) => key !== "data")) return privateReply({ error: "invalid_request" }, 400);
  const samples = (input as { data: unknown[] }).data;
  if (samples.length < 1 || samples.length > 620) return privateReply({ error: "invalid_request" }, 400);
  const days = new Map<string, MetricValues>();
  for (const sample of samples) {
    if (!sample || typeof sample !== "object") return privateReply({ error: "invalid_request" }, 400);
    const value = sample as Record<string, unknown>;
    if (Object.keys(value).some((key) => !["type", "date", "value", "unit"].includes(key))
        || typeof value.type !== "string" || typeof value.date !== "string" || typeof value.unit !== "string") {
      return privateReply({ error: "invalid_request" }, 400);
    }
    const day = value.date.slice(0, 10);
    const amount = typeof value.value === "number" ? value.value : Number(value.value);
    if (!ISO_DAY.test(day) || !Number.isFinite(Date.parse(value.date)) || !Number.isFinite(amount) || amount < 0) {
      return privateReply({ error: "invalid_request" }, 400);
    }
    const aggregate = days.get(day) ?? emptyMetrics();
    const normalized = shortcutMetric(value.type, amount, value.unit);
    if (!normalized) return privateReply({ error: "invalid_request" }, 400);
    const nextAmount = normalized.additive ? (aggregate[normalized.key] ?? 0) + normalized.amount : normalized.amount;
    const [low, high, integer] = METRIC_RULES[normalized.key];
    const valid = metric(integer ? Math.round(nextAmount) : nextAmount, low, high, integer);
    if (valid === undefined || valid === null) return privateReply({ error: "invalid_request" }, 400);
    aggregate[normalized.key] = valid;
    days.set(day, aggregate);
  }
  if (days.size > 31) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  for (const [day, values] of days) {
    const { data, error } = await store.rpc("embe_ingest_iphone_health_v2", rpcInput(token, day, values));
    if (error) return privateReply({ error: "temporarily_unavailable" }, 503);
    if (data !== true) return privateReply({ error: "unauthorized" }, 401);
  }
  return privateReply({ accepted: true, days: days.size }, 202);
}

export async function POST(request: Request): Promise<Response> {
  const shortcutToken = bearerToken(request);
  if (shortcutToken) return ingestShortcutExport(request, shortcutToken);
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  let input: unknown;
  try { input = await request.json(); } catch { return privateReply({ error: "invalid_request" }, 400); }
  const label = input && typeof input === "object" ? (input as Record<string, unknown>).label : null;
  if (typeof label !== "string" || label.trim().length < 1 || label.trim().length > 60) return privateReply({ error: "invalid_request" }, 400);
  const token = `embe_health_${randomBytes(32).toString("base64url")}`;
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const { data, error } = await store.rpc("embe_create_iphone_health_device", {
    p_token_hash: hashToken(token), p_label: label.trim()
  });
  if (error || typeof data !== "string") return privateReply({ error: "temporarily_unavailable" }, 503);
  return privateReply({ deviceId: data, token, ingestUrl: `${new URL(request.url).origin}/api/pregnancy/iphone-health` }, 201);
}

export async function GET(request: Request): Promise<Response> {
  const token = bearerToken(request);
  if (!token) return privateReply({ error: "unauthorized" }, 401);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const { data, error } = await store.rpc("embe_probe_iphone_health", { p_token_hash: hashToken(token) });
  if (error) return privateReply({ error: "temporarily_unavailable" }, 503);
  if (!data || typeof data !== "object") return privateReply({ error: "unauthorized" }, 401);
  const device = data as Record<string, unknown>;
  return privateReply({
    connected: true,
    deviceId: device.device_id,
    label: device.label,
    lastSyncedAt: device.last_synced_at ?? null
  }, 200);
}

export async function PUT(request: Request): Promise<Response> {
  const token = bearerToken(request);
  if (!token) return privateReply({ error: "unauthorized" }, 401);
  let input: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return privateReply({ error: "invalid_request" }, 413);
    input = JSON.parse(raw);
  } catch { return privateReply({ error: "invalid_request" }, 400); }
  if (!input || typeof input !== "object") return privateReply({ error: "invalid_request" }, 400);
  const body = input as Record<string, unknown>;
  const allowedKeys = new Set(["day", ...Object.keys(METRIC_RULES)]);
  const values = parsedMetrics(body);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))
      || typeof body.day !== "string" || !ISO_DAY.test(body.day) || !values
      || Object.values(values).every((value) => value === null)) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const { data, error } = await store.rpc("embe_ingest_iphone_health_v2", rpcInput(token, body.day, values));
  if (error) return privateReply({ error: "temporarily_unavailable" }, 503);
  return data === true ? privateReply({ accepted: true }, 202) : privateReply({ error: "unauthorized" }, 401);
}
