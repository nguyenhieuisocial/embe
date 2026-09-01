import { createHash, randomBytes } from "node:crypto";

import { authorizeMutation, photoStore, privateReply } from "../../../../lib/photo-upload-server";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

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

async function ingestShortcutExport(request: Request, token: string): Promise<Response> {
  let input: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 32768) return privateReply({ error: "invalid_request" }, 413);
    input = JSON.parse(raw);
  } catch { return privateReply({ error: "invalid_request" }, 400); }
  if (!input || typeof input !== "object" || !Array.isArray((input as Record<string, unknown>).data)
      || Object.keys(input).some((key) => key !== "data")) return privateReply({ error: "invalid_request" }, 400);
  const samples = (input as { data: unknown[] }).data;
  if (samples.length < 1 || samples.length > 30) return privateReply({ error: "invalid_request" }, 400);
  const days = new Map<string, { steps: number | null; activeEnergyKcal: number | null }>();
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
    const aggregate = days.get(day) ?? { steps: null, activeEnergyKcal: null };
    if (value.type === "Steps" && value.unit === "count" && Number.isInteger(amount)) {
      aggregate.steps = (aggregate.steps ?? 0) + amount;
    } else if (value.type === "Active Calories" && ["kcal", "kJ"].includes(value.unit)) {
      const kcal = value.unit === "kJ" ? amount / 4.184 : amount;
      aggregate.activeEnergyKcal = (aggregate.activeEnergyKcal ?? 0) + kcal;
    } else return privateReply({ error: "invalid_request" }, 400);
    days.set(day, aggregate);
  }
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  for (const [day, values] of days) {
    const { data, error } = await store.rpc("embe_ingest_iphone_health", {
      p_token_hash: hashToken(token), p_day: day, p_steps: values.steps,
      p_active_energy_kcal: values.activeEnergyKcal, p_resting_energy_kcal: null,
      p_sleep_minutes: null, p_weight_kg: null, p_water_ml: null, p_heart_rate_avg: null
    });
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
  const allowedKeys = new Set([
    "day", "steps", "activeEnergyKcal", "restingEnergyKcal", "sleepMinutes",
    "weightKg", "waterMl", "heartRateAvg"
  ]);
  const values = {
    steps: metric(body.steps, 0, 200000, true),
    activeEnergyKcal: metric(body.activeEnergyKcal, 0, 10000),
    restingEnergyKcal: metric(body.restingEnergyKcal, 0, 10000),
    sleepMinutes: metric(body.sleepMinutes, 0, 1440, true),
    weightKg: metric(body.weightKg, 25, 300),
    waterMl: metric(body.waterMl, 0, 15000, true),
    heartRateAvg: metric(body.heartRateAvg, 25, 240)
  };
  if (Object.keys(body).some((key) => !allowedKeys.has(key))
      || typeof body.day !== "string" || !ISO_DAY.test(body.day) || Object.values(values).some((value) => value === undefined)
      || Object.values(values).every((value) => value === null)) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const { data, error } = await store.rpc("embe_ingest_iphone_health", {
    p_token_hash: hashToken(token), p_day: body.day, p_steps: values.steps,
    p_active_energy_kcal: values.activeEnergyKcal, p_resting_energy_kcal: values.restingEnergyKcal,
    p_sleep_minutes: values.sleepMinutes, p_weight_kg: values.weightKg,
    p_water_ml: values.waterMl, p_heart_rate_avg: values.heartRateAvg
  });
  if (error) return privateReply({ error: "temporarily_unavailable" }, 503);
  return data === true ? privateReply({ accepted: true }, 202) : privateReply({ error: "unauthorized" }, 401);
}
