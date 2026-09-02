import { NextResponse } from "next/server";

import { verifySessionCookie } from "../../../../../lib/portal-auth";
import { cookieValue, hasExpectedOrigin, passkeySite, validCredentialId } from "../../../../../lib/passkey";
import { passkeyList, passkeyStore } from "../../../../../lib/passkey-store";

const PRIVATE_HEADERS = { "cache-control": "private, no-store" };

function authorized(request: Request): boolean {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  return Boolean(secret && verifySessionCookie(cookieValue(request, "embe_session"), secret));
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  const store = passkeyStore();
  if (!store) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  const { data, error } = await store.rpc("embe_list_passkeys");
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  const devices = passkeyList(data).map((item) => ({
    credentialId: item.credential_id, label: item.label ?? "Thiết bị",
    createdAt: item.created_at ?? null, lastUsedAt: item.last_used_at ?? null, backedUp: Boolean(item.backed_up)
  }));
  return NextResponse.json({ devices }, { headers: PRIVATE_HEADERS });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const site = passkeySite(request);
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  if (!site || !hasExpectedOrigin(request, site.origin)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: PRIVATE_HEADERS });
  const body = await request.json().catch(() => null) as { credentialId?: unknown } | null;
  if (!validCredentialId(body?.credentialId)) return NextResponse.json({ error: "invalid" }, { status: 400, headers: PRIVATE_HEADERS });
  const store = passkeyStore();
  if (!store) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  const { error } = await store.rpc("embe_disable_passkey", { p_credential_id: body.credentialId });
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
}
