import { callFamilyProfileRpc } from "../../../../lib/family-profile-server";
import { validBirthDate } from "../../../../lib/family-profile";
import { verifySessionCookie } from "../../../../lib/portal-auth";
import { authorizeMutation } from "../../../../lib/photo-upload-server";

const BODY_LIMIT = 1024;

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

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return reply({ error: "unauthorized" }, 401);
  const profile = await callFamilyProfileRpc("embe_get_family_profile", {});
  return profile ? reply(profile, 200) : reply({ error: "temporarily_unavailable" }, 503);
}

export async function PATCH(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return reply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > BODY_LIMIT) return reply({ error: "invalid_request" }, 413);

  let value: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > BODY_LIMIT) return reply({ error: "invalid_request" }, 413);
    value = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return reply({ error: "invalid_request" }, 400);
  }
  if (!value || typeof value !== "object"
    || Object.keys(value).some((key) => !["motherBirthDate", "fatherBirthDate"].includes(key))) {
    return reply({ error: "invalid_request" }, 400);
  }
  const motherBirthDate = validBirthDate(value.motherBirthDate);
  const fatherBirthDate = validBirthDate(value.fatherBirthDate);
  if (motherBirthDate === undefined || fatherBirthDate === undefined) return reply({ error: "invalid_request" }, 400);

  const profile = await callFamilyProfileRpc("embe_save_family_profile", {
    p_mother_birth_date: motherBirthDate,
    p_father_birth_date: fatherBirthDate
  });
  return profile ? reply(profile, 200) : reply({ error: "temporarily_unavailable" }, 503);
}
