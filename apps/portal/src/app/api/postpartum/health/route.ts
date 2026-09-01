import { verifySessionCookie } from "../../../../lib/portal-auth";
import { authorizeMutation } from "../../../../lib/photo-upload-server";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_DAYS = new Set([7, 42, 90]);
const ENUMS = {
  lochia: new Set(["none", "light", "moderate", "heavy"]),
  woundStatus: new Set(["not_applicable", "comfortable", "tender", "red_swollen", "drainage"]),
  urination: new Set(["comfortable", "discomfort", "difficulty"]),
  digestion: new Set(["usual", "constipated", "diarrhea", "other"])
} as const;
const NUMBERS = {
  pain: [0, 10, true], temperatureC: [34, 43, false], systolic: [60, 250, true],
  diastolic: [30, 160, true], pelvicPain: [0, 10, true], breastDiscomfort: [0, 10, true],
  sleepMinutes: [0, 1440, true], exhaustion: [1, 5, true], support: [1, 5, true],
  mood: [1, 5, true], phq2Interest: [0, 3, true], phq2Depressed: [0, 3, true]
} as const;

type MetricName = keyof typeof NUMBERS;

function cookieValue(header: string | null, name: string): string | undefined {
  return header?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.slice(1).join("=");
}

function authorized(request: Request): boolean {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  return Boolean(secret && verifySessionCookie(cookieValue(request.headers.get("cookie"), "embe_session"), secret));
}

function reply(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function numberValue(value: unknown, name: MetricName): number | null | undefined {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const [min, max, integer] = NUMBERS[name];
  return value >= min && value <= max && (!integer || Number.isInteger(value)) ? value : undefined;
}

function databaseNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function enumValue(value: unknown, allowed: ReadonlySet<string>): string | null | undefined {
  if (value === null || value === "" || value === undefined) return null;
  return typeof value === "string" && allowed.has(value) ? value : undefined;
}

function normalize(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!isIsoDate(row.day)) return null;
  const result: Record<string, unknown> = { day: row.day };
  for (const [client, database] of [
    ["pain", "pain"], ["temperatureC", "temperature_c"], ["systolic", "systolic"],
    ["diastolic", "diastolic"], ["pelvicPain", "pelvic_pain"],
    ["breastDiscomfort", "breast_discomfort"], ["sleepMinutes", "sleep_minutes"],
    ["exhaustion", "exhaustion"], ["support", "support"], ["mood", "mood"],
    ["phq2Interest", "phq2_interest"], ["phq2Depressed", "phq2_depressed"]
  ] as const) {
    const parsed = databaseNumber(row[database]);
    if (parsed === undefined) return null;
    result[client] = parsed;
  }
  for (const [client, database, allowed] of [
    ["lochia", "lochia", ENUMS.lochia], ["woundStatus", "wound_status", ENUMS.woundStatus],
    ["urination", "urination", ENUMS.urination], ["digestion", "digestion", ENUMS.digestion]
  ] as const) {
    const parsed = enumValue(row[database], allowed);
    if (parsed === undefined) return null;
    result[client] = parsed;
  }
  if (row.feeding_difficulty !== null && typeof row.feeding_difficulty !== "boolean") return null;
  if (row.notes !== null && typeof row.notes !== "string") return null;
  result.feedingDifficulty = row.feeding_difficulty;
  result.notes = row.notes;
  return result;
}

async function rpc(name: string, body: Record<string, unknown>): Promise<unknown | null> {
  const baseUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!baseUrl || !key) return null;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return response.ok ? response.json() : null;
  } catch { return null; }
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return reply({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const end = url.searchParams.get("end");
  const days = Number(url.searchParams.get("days") ?? "42");
  if (!isIsoDate(end) || !Number.isInteger(days) || !ALLOWED_DAYS.has(days)) return reply({ error: "invalid_request" }, 400);
  const raw = await rpc("embe_get_postpartum_health_history", { p_end_day: end, p_days: days });
  if (!Array.isArray(raw)) return reply({ error: "temporarily_unavailable" }, 503);
  const history = raw.map(normalize);
  return history.some((item) => item === null) ? reply({ error: "temporarily_unavailable" }, 503) : reply({ history }, 200);
}

export async function PATCH(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return reply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  let value: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8192) return reply({ error: "invalid_request" }, 413);
    value = JSON.parse(raw) as Record<string, unknown>;
  } catch { return reply({ error: "invalid_request" }, 400); }
  if (!value || !isIsoDate(value.day)) return reply({ error: "invalid_request" }, 400);
  const allowedKeys = new Set(["day", ...Object.keys(NUMBERS), ...Object.keys(ENUMS), "feedingDifficulty", "notes"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return reply({ error: "invalid_request" }, 400);

  const numbers = Object.fromEntries(Object.keys(NUMBERS).map((key) => [key, numberValue(value[key], key as MetricName)]));
  const enumerations = {
    lochia: enumValue(value.lochia, ENUMS.lochia),
    woundStatus: enumValue(value.woundStatus, ENUMS.woundStatus),
    urination: enumValue(value.urination, ENUMS.urination),
    digestion: enumValue(value.digestion, ENUMS.digestion)
  };
  const notes = value.notes === null || value.notes === undefined || value.notes === "" ? null
    : typeof value.notes === "string" && value.notes.trim().length <= 1000 ? value.notes.trim() : undefined;
  const feedingDifficulty = value.feedingDifficulty === null || value.feedingDifficulty === undefined
    ? null : typeof value.feedingDifficulty === "boolean" ? value.feedingDifficulty : undefined;
  if ([...Object.values(numbers), ...Object.values(enumerations), notes, feedingDifficulty].includes(undefined)) {
    return reply({ error: "invalid_request" }, 400);
  }
  const raw = await rpc("embe_save_postpartum_health", {
    p_day: value.day, p_lochia: enumerations.lochia, p_pain: numbers.pain,
    p_temperature_c: numbers.temperatureC, p_systolic: numbers.systolic, p_diastolic: numbers.diastolic,
    p_wound_status: enumerations.woundStatus, p_urination: enumerations.urination,
    p_digestion: enumerations.digestion, p_pelvic_pain: numbers.pelvicPain,
    p_breast_discomfort: numbers.breastDiscomfort, p_feeding_difficulty: feedingDifficulty,
    p_sleep_minutes: numbers.sleepMinutes, p_exhaustion: numbers.exhaustion, p_support: numbers.support,
    p_mood: numbers.mood, p_phq2_interest: numbers.phq2Interest, p_phq2_depressed: numbers.phq2Depressed,
    p_notes: notes
  });
  const row = Array.isArray(raw) ? raw[0] : raw;
  const health = normalize(row);
  return health ? reply({ health }, 200) : reply({ error: "temporarily_unavailable" }, 503);
}
