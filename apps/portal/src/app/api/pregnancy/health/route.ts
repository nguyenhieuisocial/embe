import { verifySessionCookie } from "../../../../lib/portal-auth";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_DAYS = new Set([7, 28, 90]);
const METRIC_KEYS = [
  "weightKg",
  "systolic",
  "diastolic",
  "sleepMinutes",
  "waterGlasses",
  "movementMinutes",
  "wellbeing"
] as const;

type MetricKey = (typeof METRIC_KEYS)[number];

type HealthMetric = {
  day: string;
  weightKg: number | null;
  systolic: number | null;
  diastolic: number | null;
  sleepMinutes: number | null;
  waterGlasses: number | null;
  movementMinutes: number | null;
  wellbeing: number | null;
  checklistPercent: number;
};

const BOUNDS: Record<MetricKey, readonly [number, number, boolean]> = {
  weightKg: [25, 300, false],
  systolic: [60, 250, true],
  diastolic: [30, 160, true],
  sleepMinutes: [0, 1440, true],
  waterGlasses: [0, 30, true],
  movementMinutes: [0, 600, true],
  wellbeing: [1, 5, true]
};

function cookieValue(header: string | null, name: string): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.slice(1).join("=");
}

function authorized(request: Request): boolean {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  const session = cookieValue(request.headers.get("cookie"), "embe_session");
  return Boolean(secret && verifySessionCookie(session, secret));
}

function reply(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store" }
  });
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function boundedNumber(value: unknown, key: MetricKey): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const [minimum, maximum, integer] = BOUNDS[key];
  if (value < minimum || value > maximum || (integer && !Number.isInteger(value))) return undefined;
  return value;
}

function databaseNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function normalizeMetric(value: unknown): HealthMetric | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!isIsoDate(row.day)) return null;

  const mapped = {
    weightKg: databaseNumber(row.weight_kg),
    systolic: databaseNumber(row.systolic),
    diastolic: databaseNumber(row.diastolic),
    sleepMinutes: databaseNumber(row.sleep_minutes),
    waterGlasses: databaseNumber(row.water_glasses),
    movementMinutes: databaseNumber(row.movement_minutes),
    wellbeing: databaseNumber(row.wellbeing)
  };
  if (Object.values(mapped).some((item) => item === undefined)) return null;
  const checklistPercent = databaseNumber(row.checklist_percent);
  if (checklistPercent === undefined || checklistPercent === null || checklistPercent < 0 || checklistPercent > 100) {
    return null;
  }

  return {
    day: row.day,
    weightKg: mapped.weightKg as number | null,
    systolic: mapped.systolic as number | null,
    diastolic: mapped.diastolic as number | null,
    sleepMinutes: mapped.sleepMinutes as number | null,
    waterGlasses: mapped.waterGlasses as number | null,
    movementMinutes: mapped.movementMinutes as number | null,
    wellbeing: mapped.wellbeing as number | null,
    checklistPercent
  };
}

async function callRpc(name: string, body: Record<string, unknown>): Promise<unknown | null> {
  const baseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!baseUrl || !secretKey) return null;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: secretKey,
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return reply({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const end = url.searchParams.get("end");
  const days = Number(url.searchParams.get("days") ?? "28");
  if (!isIsoDate(end) || !Number.isInteger(days) || !ALLOWED_DAYS.has(days)) {
    return reply({ error: "invalid_request" }, 400);
  }

  const value = await callRpc("embe_get_pregnancy_health_history", {
    p_end_day: end,
    p_days: days
  });
  if (!Array.isArray(value)) return reply({ error: "temporarily_unavailable" }, 503);
  const history = value.map(normalizeMetric);
  if (history.some((metric) => metric === null)) return reply({ error: "temporarily_unavailable" }, 503);
  return reply({ history }, 200);
}

export async function PATCH(request: Request): Promise<Response> {
  if (!authorized(request)) return reply({ error: "unauthorized" }, 401);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 4096) return reply({ error: "invalid_request" }, 413);

  let input: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 4096) return reply({ error: "invalid_request" }, 413);
    input = JSON.parse(rawBody);
  } catch {
    return reply({ error: "invalid_request" }, 400);
  }
  if (!input || typeof input !== "object") return reply({ error: "invalid_request" }, 400);
  const value = input as Record<string, unknown>;
  const allowedKeys = new Set<string>(["day", ...METRIC_KEYS]);
  if (!isIsoDate(value.day) || Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return reply({ error: "invalid_request" }, 400);
  }

  const metrics = Object.fromEntries(METRIC_KEYS.map((key) => [key, boundedNumber(value[key], key)])) as Record<MetricKey, number | null | undefined>;
  if (Object.values(metrics).some((metric) => metric === undefined)) {
    return reply({ error: "invalid_request" }, 400);
  }

  const result = await callRpc("embe_save_pregnancy_health", {
    p_day: value.day,
    p_weight_kg: metrics.weightKg,
    p_systolic: metrics.systolic,
    p_diastolic: metrics.diastolic,
    p_sleep_minutes: metrics.sleepMinutes,
    p_water_glasses: metrics.waterGlasses,
    p_movement_minutes: metrics.movementMinutes,
    p_wellbeing: metrics.wellbeing
  });
  const candidate = Array.isArray(result) ? result[0] : result;
  const metric = normalizeMetric(candidate);
  return metric ? reply({ metric }, 200) : reply({ error: "temporarily_unavailable" }, 503);
}
