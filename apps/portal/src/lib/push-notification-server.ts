import webpush from "web-push";

import { verifySessionCookie } from "./portal-auth";

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body: string; url: string; tag: string };

function cookieValue(header: string | null, name: string): string | undefined {
  return header?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.slice(1).join("=");
}

export function familySessionAuthorized(request: Request): boolean {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  return Boolean(secret && verifySessionCookie(cookieValue(request.headers.get("cookie"), "embe_session"), secret));
}

export function pushConfigured(): boolean {
  return Boolean(process.env.EMBE_VAPID_PUBLIC_KEY && process.env.EMBE_VAPID_PRIVATE_KEY);
}

export async function sendPush(target: PushTarget, message: PushMessage): Promise<void> {
  const publicKey = process.env.EMBE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.EMBE_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("push_not_configured");
  webpush.setVapidDetails("mailto:family@hieu.asia", publicKey, privateKey);
  await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(message), {
    TTL: 86_400, urgency: "normal", timeout: 10_000
  });
}

export function pushErrorCode(value: unknown): string {
  if (value && typeof value === "object" && "statusCode" in value && typeof value.statusCode === "number") return `http_${value.statusCode}`;
  return value instanceof Error && /^[a-z0-9_]{1,80}$/i.test(value.message) ? value.message : "push_failed";
}
