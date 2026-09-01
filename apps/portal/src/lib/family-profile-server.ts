import { EMPTY_FAMILY_PROFILE, type FamilyProfile } from "./family-profile";

function normalize(value: unknown): FamilyProfile | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const mother = row.mother_birth_date;
  const father = row.father_birth_date;
  if ((mother !== null && typeof mother !== "string") || (father !== null && typeof father !== "string")) return null;
  return { motherBirthDate: mother as string | null, fatherBirthDate: father as string | null };
}

export async function callFamilyProfileRpc(
  name: "embe_get_family_profile" | "embe_save_family_profile",
  body: Record<string, unknown>
): Promise<FamilyProfile | null> {
  const baseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!baseUrl || !secretKey) return null;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { apikey: secretKey, authorization: `Bearer ${secretKey}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return response.ok ? normalize(await response.json()) : null;
  } catch {
    return null;
  }
}

export async function getFamilyProfile(): Promise<FamilyProfile> {
  return await callFamilyProfileRpc("embe_get_family_profile", {}) ?? EMPTY_FAMILY_PROFILE;
}
