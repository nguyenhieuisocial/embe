import { authorizeMutation, isUuidV4, photoStore, privateReply } from "../../../../lib/photo-upload-server";
import { verifySessionCookie } from "../../../../lib/portal-auth";

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const ALLOWED_FIELDS = new Set([
  "occurredAt", "mood", "anxiety", "note",
  "phq2Interest", "phq2Depressed", "gad2Nervous", "gad2Control"
]);

type MentalHealthCheckin = {
  id: string;
  occurredAt: string;
  mood: number;
  anxiety: number;
  note: string;
  phq2Interest: number | null;
  phq2Depressed: number | null;
  gad2Nervous: number | null;
  gad2Control: number | null;
  createdAt: string;
};

function cookieValue(header: string | null): string | undefined {
  return header?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === "embe_session")?.slice(1).join("=");
}

function authorized(request: Request): boolean {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  return Boolean(secret && verifySessionCookie(cookieValue(request.headers.get("cookie")), secret));
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime())
    && parsed >= new Date("2020-01-01T00:00:00.000Z")
    && parsed.getTime() <= Date.now() + 5 * 60_000;
}

function validStoredTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && !Number.isNaN(new Date(value).getTime())
    && new Date(value) >= new Date("2020-01-01T00:00:00.000Z")
    && new Date(value) < new Date("2101-01-01T00:00:00.000Z");
}

function score(value: unknown, minimum: number, maximum: number): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : undefined;
}

function normalize(value: unknown): MentalHealthCheckin | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const occurredAt = validStoredTimestamp(row.occurred_at) ? row.occurred_at : null;
  const createdAt = validStoredTimestamp(row.created_at) ? row.created_at : null;
  const mood = score(row.mood, 1, 5);
  const anxiety = score(row.anxiety, 1, 5);
  const phq2Interest = score(row.phq2_interest, 0, 3);
  const phq2Depressed = score(row.phq2_depressed, 0, 3);
  const gad2Nervous = score(row.gad2_nervous, 0, 3);
  const gad2Control = score(row.gad2_control, 0, 3);
  const note = typeof row.note === "string" && row.note.length <= 500 ? row.note : null;
  if (!isUuidV4(row.id) || !occurredAt || !createdAt || mood === null || mood === undefined
      || anxiety === null || anxiety === undefined || note === null
      || phq2Interest === undefined || phq2Depressed === undefined
      || gad2Nervous === undefined || gad2Control === undefined) return null;
  return {
    id: row.id, occurredAt, mood, anxiety, note,
    phq2Interest, phq2Depressed, gad2Nervous, gad2Control, createdAt
  };
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return privateReply({ error: "unauthorized" }, 401);
  const days = Number(new URL(request.url).searchParams.get("days") ?? "28");
  if (days !== 7 && days !== 28) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const { data, error } = await store.rpc("embe_get_pregnancy_mental_health_history", { p_days: days });
  if (error || !Array.isArray(data)) return privateReply({ error: "temporarily_unavailable" }, 503);
  const history = data.map(normalize);
  return history.some((entry) => entry === null)
    ? privateReply({ error: "temporarily_unavailable" }, 503)
    : privateReply({ history }, 200);
}

export async function POST(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 2048) return privateReply({ error: "invalid_request" }, 413);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return privateReply({ error: "invalid_request" }, 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return privateReply({ error: "invalid_request" }, 400);
  }

  const mood = score(body.mood, 1, 5);
  const anxiety = score(body.anxiety, 1, 5);
  const phq2Interest = score(body.phq2Interest, 0, 3);
  const phq2Depressed = score(body.phq2Depressed, 0, 3);
  const gad2Nervous = score(body.gad2Nervous, 0, 3);
  const gad2Control = score(body.gad2Control, 0, 3);
  const note = typeof body.note === "string" && body.note.trim().length <= 500 ? body.note.trim() : null;
  const phqPairComplete = (phq2Interest === null) === (phq2Depressed === null);
  const gadPairComplete = (gad2Nervous === null) === (gad2Control === null);
  if (Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key)) || !validTimestamp(body.occurredAt)
      || mood === null || mood === undefined || anxiety === null || anxiety === undefined || note === null
      || phq2Interest === undefined || phq2Depressed === undefined
      || gad2Nervous === undefined || gad2Control === undefined || !phqPairComplete || !gadPairComplete) {
    return privateReply({ error: "invalid_request" }, 400);
  }

  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const { data, error } = await store.rpc("embe_save_pregnancy_mental_health_checkin", {
    p_occurred_at: body.occurredAt,
    p_mood: mood,
    p_anxiety: anxiety,
    p_note: note,
    p_phq2_interest: phq2Interest,
    p_phq2_depressed: phq2Depressed,
    p_gad2_nervous: gad2Nervous,
    p_gad2_control: gad2Control
  });
  const checkin = normalize(Array.isArray(data) ? data[0] : data);
  return error || !checkin
    ? privateReply({ error: "temporarily_unavailable" }, 503)
    : privateReply({ checkin }, 201);
}
