import { createHash, randomBytes } from "node:crypto";

import { authorizeMutation, photoStore, privateReply } from "../../../../lib/photo-upload-server";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function metric(value: unknown, low: number, high: number, integer = false): number | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high || (integer && !Number.isInteger(value))) return undefined;
  return value;
}

export async function POST(request: Request): Promise<Response> {
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

export async function PUT(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!/^embe_health_[A-Za-z0-9_-]{43}$/.test(token)) return privateReply({ error: "unauthorized" }, 401);
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
