import { authorizeMutation, isUuidV4, photoStore, privateReply } from "../../../../lib/photo-upload-server";
import { verifySessionCookie } from "../../../../lib/portal-auth";
import { revalidateFamilyViews } from "../../../../lib/family-view-revalidation";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const GESTATION_TYPES = new Set(["singleton", "twins", "multiples"]);
const DUE_DATE_SOURCES = new Set(["estimated_lmp", "ultrasound", "clinician"]);
const BLOOD_GROUPS = new Set(["A", "B", "AB", "O"]);
const RH_FACTORS = new Set(["positive", "negative"]);
const CONTACT_KINDS = new Set(["doctor", "midwife", "clinic", "hospital", "emergency", "support"]);
const PHONE = /^\+?[0-9][0-9 ()-]{5,24}$/;

function cookieValue(header: string | null): string | undefined {
  return header?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === "embe_session")?.slice(1).join("=");
}

function authorized(request: Request): boolean {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  return Boolean(secret && verifySessionCookie(cookieValue(request.headers.get("cookie")), secret));
}

function optionalChoice(value: unknown, choices: Set<string>): string | null | undefined {
  if (value === null || value === "") return null;
  return typeof value === "string" && choices.has(value) ? value : undefined;
}

function optionalText(value: unknown, maximum: number): string | undefined {
  return typeof value === "string" && value.trim().length <= maximum ? value.trim() : undefined;
}

function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

type CareContact = {
  id: string;
  kind: string;
  name: string;
  organization: string;
  phone: string;
  note: string;
  primary: boolean;
};

function normalizeContact(value: unknown): CareContact | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!isUuidV4(row.id) || typeof row.kind !== "string" || !CONTACT_KINDS.has(row.kind)
      || typeof row.name !== "string" || typeof row.organization !== "string"
      || typeof row.phone !== "string" || typeof row.note !== "string" || typeof row.primary !== "boolean") return null;
  return { id: row.id, kind: row.kind, name: row.name, organization: row.organization, phone: row.phone, note: row.note, primary: row.primary };
}

function normalizeProfile(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const contacts = Array.isArray(row.contacts) ? row.contacts.map(normalizeContact) : null;
  if (!contacts || contacts.some((contact) => contact === null)) return null;
  const dueDate = row.due_date === null ? null : validDay(row.due_date) ? row.due_date : undefined;
  const lmpDate = row.lmp_date === null ? null : validDay(row.lmp_date) ? row.lmp_date : undefined;
  const dueDateSource = optionalChoice(row.due_date_source, DUE_DATE_SOURCES);
  const gestationType = optionalChoice(row.gestation_type, GESTATION_TYPES);
  const bloodGroup = optionalChoice(row.blood_group, BLOOD_GROUPS);
  const rhFactor = optionalChoice(row.rh_factor, RH_FACTORS);
  if ([dueDate, lmpDate, dueDateSource, gestationType, bloodGroup, rhFactor].some((item) => item === undefined)
      || typeof row.allergies !== "string" || typeof row.medical_notes !== "string") return null;
  return {
    dueDate, dueDateSource, lmpDate, gestationType, bloodGroup, rhFactor,
    allergies: row.allergies, medicalNotes: row.medical_notes, contacts
  };
}

async function refresh(): Promise<Record<string, unknown> | null> {
  const store = photoStore();
  if (!store) return null;
  const { data, error } = await store.rpc("embe_get_pregnancy_profile");
  return error ? null : normalizeProfile(data);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return privateReply({ error: "unauthorized" }, 401);
  const profile = await refresh();
  return profile ? privateReply({ profile }, 200) : privateReply({ error: "temporarily_unavailable" }, 503);
}

export async function PATCH(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8192) return privateReply({ error: "invalid_request" }, 413);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return privateReply({ error: "invalid_request" }, 400);
    body = parsed as Record<string, unknown>;
  } catch { return privateReply({ error: "invalid_request" }, 400); }
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);

  if (body.action === "profile" && body.profile && typeof body.profile === "object"
      && Object.keys(body).every((key) => ["action", "profile"].includes(key))) {
    const profile = body.profile as Record<string, unknown>;
    const allowed = new Set(["dueDate", "dueDateSource", "lmpDate", "gestationType", "bloodGroup", "rhFactor", "allergies", "medicalNotes"]);
    const dueDate = profile.dueDate === null || profile.dueDate === "" ? null : validDay(profile.dueDate) ? profile.dueDate : undefined;
    const lmpDate = profile.lmpDate === null || profile.lmpDate === "" ? null : validDay(profile.lmpDate) ? profile.lmpDate : undefined;
    const dueDateSource = optionalChoice(profile.dueDateSource, DUE_DATE_SOURCES);
    const gestationType = optionalChoice(profile.gestationType, GESTATION_TYPES);
    const bloodGroup = optionalChoice(profile.bloodGroup, BLOOD_GROUPS);
    const rhFactor = optionalChoice(profile.rhFactor, RH_FACTORS);
    const allergies = optionalText(profile.allergies, 500);
    const medicalNotes = optionalText(profile.medicalNotes, 1000);
    if (Object.keys(profile).some((key) => !allowed.has(key))
        || [dueDate, lmpDate, dueDateSource, gestationType, bloodGroup, rhFactor, allergies, medicalNotes].some((item) => item === undefined)) {
      return privateReply({ error: "invalid_request" }, 400);
    }
    const { error } = await store.rpc("embe_save_pregnancy_profile", {
      p_due_date: dueDate, p_due_date_source: dueDateSource, p_lmp_date: lmpDate,
      p_gestation_type: gestationType, p_blood_group: bloodGroup, p_rh_factor: rhFactor,
      p_allergies: allergies, p_medical_notes: medicalNotes
    });
    if (error) return privateReply({ error: "temporarily_unavailable" }, 503);
  } else if (body.action === "contact" && body.contact && typeof body.contact === "object"
      && Object.keys(body).every((key) => ["action", "contact"].includes(key))) {
    const contact = body.contact as Record<string, unknown>;
    const allowed = new Set(["id", "kind", "name", "organization", "phone", "note", "primary"]);
    const name = optionalText(contact.name, 80);
    const organization = optionalText(contact.organization, 120);
    const phone = optionalText(contact.phone, 25);
    const note = optionalText(contact.note, 300);
    const valid = Object.keys(contact).every((key) => allowed.has(key))
      && (contact.id === null || isUuidV4(contact.id))
      && typeof contact.kind === "string" && CONTACT_KINDS.has(contact.kind)
      && name !== undefined && name.length > 0 && organization !== undefined
      && phone !== undefined && PHONE.test(phone) && note !== undefined
      && typeof contact.primary === "boolean";
    if (!valid) return privateReply({ error: "invalid_request" }, 400);
    const { error } = await store.rpc("embe_save_pregnancy_care_contact", {
      p_id: contact.id, p_kind: contact.kind, p_name: name, p_organization: organization,
      p_phone: phone, p_note: note, p_primary: contact.primary
    });
    if (error) return privateReply({ error: "temporarily_unavailable" }, 503);
  } else if (body.action === "deleteContact" && isUuidV4(body.contactId)
      && Object.keys(body).every((key) => ["action", "contactId"].includes(key))) {
    const { error } = await store.rpc("embe_delete_pregnancy_care_contact", { p_id: body.contactId });
    if (error) return privateReply({ error: "temporarily_unavailable" }, 503);
  } else {
    return privateReply({ error: "invalid_request" }, 400);
  }

  const profile = await refresh();
  if (profile) revalidateFamilyViews();
  return profile ? privateReply({ profile }, 200) : privateReply({ error: "temporarily_unavailable" }, 503);
}
