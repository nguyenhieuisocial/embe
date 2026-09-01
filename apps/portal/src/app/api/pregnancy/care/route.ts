import { authorizeMutation, isUuidV4, photoStore, privateReply } from "../../../../lib/photo-upload-server";
import { PREGNANCY_NUTRIENTS } from "../../../../lib/pregnancy-nutrition";
import { verifySessionCookie } from "../../../../lib/portal-auth";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES = new Set(["medicine", "supplement"]);
const ACTIVITY_LEVELS = new Set(["sedentary", "low_active", "active", "very_active"]);
const NUTRIENTS = new Set<string>(PREGNANCY_NUTRIENTS.map((item) => item.key));

function cookieValue(header: string | null): string | undefined {
  return header?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === "embe_session")?.slice(1).join("=");
}

function authorized(request: Request): boolean {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  return Boolean(secret && verifySessionCookie(cookieValue(request.headers.get("cookie")), secret));
}

function finiteOrNull(value: unknown, low: number, high: number): number | null | undefined {
  if (value === null || value === "") return null;
  return typeof value === "number" && Number.isFinite(value) && value >= low && value <= high ? value : undefined;
}

async function refresh(day: string) {
  const store = photoStore();
  if (!store) return null;
  const { data, error } = await store.rpc("embe_get_pregnancy_care", { p_day: day });
  return error || !data || typeof data !== "object" ? null : data;
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return privateReply({ error: "unauthorized" }, 401);
  const day = new URL(request.url).searchParams.get("day") ?? "";
  if (!ISO_DAY.test(day)) return privateReply({ error: "invalid_request" }, 400);
  const snapshot = await refresh(day);
  return snapshot ? privateReply({ snapshot }, 200) : privateReply({ error: "temporarily_unavailable" }, 503);
}

export async function PATCH(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  let input: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8192) return privateReply({ error: "invalid_request" }, 413);
    input = JSON.parse(raw);
  } catch { return privateReply({ error: "invalid_request" }, 400); }
  if (!input || typeof input !== "object") return privateReply({ error: "invalid_request" }, 400);
  const body = input as Record<string, unknown>;
  const day = typeof body.day === "string" && ISO_DAY.test(body.day) ? body.day : "";
  const store = photoStore();
  if (!day || !store) return privateReply({ error: day ? "temporarily_unavailable" : "invalid_request" }, day ? 503 : 400);

  if (body.action === "profile" && body.profile && typeof body.profile === "object") {
    const profile = body.profile as Record<string, unknown>;
    const birthDate = profile.birthDate === null || profile.birthDate === "" ? null
      : typeof profile.birthDate === "string" && ISO_DAY.test(profile.birthDate) ? profile.birthDate : undefined;
    const heightCm = finiteOrNull(profile.heightCm, 120, 220);
    const weightKg = finiteOrNull(profile.prePregnancyWeightKg, 25, 300);
    const target = finiteOrNull(profile.clinicianEnergyTargetKcal, 1000, 5000);
    const activity = profile.activityLevel === null || profile.activityLevel === "" ? null
      : typeof profile.activityLevel === "string" && ACTIVITY_LEVELS.has(profile.activityLevel) ? profile.activityLevel : undefined;
    if ([birthDate, heightCm, weightKg, target, activity].some((value) => value === undefined)) {
      return privateReply({ error: "invalid_request" }, 400);
    }
    const { error } = await store.rpc("embe_save_pregnancy_wellness_profile", {
      p_birth_date: birthDate, p_height_cm: heightCm, p_pre_pregnancy_weight_kg: weightKg,
      p_activity_level: activity, p_clinician_energy_target_kcal: target
    });
    if (error) return privateReply({ error: "temporarily_unavailable" }, 503);
  } else if (body.action === "plan" && body.plan && typeof body.plan === "object") {
    const plan = body.plan as Record<string, unknown>;
    const nutrients = plan.nutrientAmounts && typeof plan.nutrientAmounts === "object"
      ? Object.fromEntries(Object.entries(plan.nutrientAmounts as Record<string, unknown>)
          .filter(([key, value]) => NUTRIENTS.has(key) && typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100000))
      : {};
    const valid = (plan.id === null || isUuidV4(plan.id)) && typeof plan.category === "string" && CATEGORIES.has(plan.category)
      && typeof plan.name === "string" && plan.name.trim().length >= 1 && plan.name.trim().length <= 80
      && typeof plan.doseDisplay === "string" && plan.doseDisplay.trim().length >= 1 && plan.doseDisplay.trim().length <= 80
      && Number.isInteger(plan.timesPerDay) && Number(plan.timesPerDay) >= 1 && Number(plan.timesPerDay) <= 6
      && typeof plan.instructions === "string" && plan.instructions.trim().length <= 240
      && typeof plan.confirmedByClinician === "boolean" && typeof plan.active === "boolean";
    if (!valid) return privateReply({ error: "invalid_request" }, 400);
    const name = plan.name as string;
    const doseDisplay = plan.doseDisplay as string;
    const instructions = plan.instructions as string;
    const { error } = await store.rpc("embe_save_pregnancy_care_plan", {
      p_id: plan.id, p_category: plan.category, p_name: name.trim(),
      p_dose_display: doseDisplay.trim(), p_times_per_day: plan.timesPerDay,
      p_instructions: instructions.trim(), p_nutrient_amounts: nutrients,
      p_confirmed_by_clinician: plan.confirmedByClinician, p_active: plan.active
    });
    if (error) return privateReply({ error: "temporarily_unavailable" }, 503);
  } else if (body.action === "intake" && isUuidV4(body.planId)
      && Number.isInteger(body.slot) && Number(body.slot) >= 1 && Number(body.slot) <= 6
      && typeof body.taken === "boolean") {
    const { error } = await store.rpc("embe_toggle_pregnancy_care_intake", {
      p_plan_id: body.planId, p_day: day, p_slot: body.slot, p_taken: body.taken
    });
    if (error) return privateReply({ error: "temporarily_unavailable" }, 503);
  } else {
    return privateReply({ error: "invalid_request" }, 400);
  }

  const snapshot = await refresh(day);
  return snapshot ? privateReply({ snapshot }, 200) : privateReply({ error: "temporarily_unavailable" }, 503);
}
