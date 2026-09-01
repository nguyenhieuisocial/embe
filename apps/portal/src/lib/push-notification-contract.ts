export type FamilyDeviceRole = "mother" | "father" | "family";

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceRole: FamilyDeviceRole;
  timezone: string;
};

function validTimezone(value: string): boolean {
  if (value.length < 1 || value.length > 64) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}

export function normalizePushSubscription(value: unknown): PushSubscriptionInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const subscription = input.subscription;
  if (!subscription || typeof subscription !== "object" || Array.isArray(subscription)) return null;
  const raw = subscription as Record<string, unknown>;
  const keys = raw.keys;
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) return null;
  const key = keys as Record<string, unknown>;
  if (typeof raw.endpoint !== "string" || raw.endpoint.length > 2048
      || typeof key.p256dh !== "string" || key.p256dh.length < 80 || key.p256dh.length > 128
      || typeof key.auth !== "string" || key.auth.length < 16 || key.auth.length > 64
      || typeof input.deviceRole !== "string" || !["mother", "father", "family"].includes(input.deviceRole)
      || typeof input.timezone !== "string" || !validTimezone(input.timezone)) return null;
  try {
    const endpoint = new URL(raw.endpoint);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) return null;
  } catch { return null; }
  if (!/^[A-Za-z0-9_-]+$/.test(key.p256dh) || !/^[A-Za-z0-9_-]+$/.test(key.auth)) return null;
  return {
    endpoint: raw.endpoint, p256dh: key.p256dh, auth: key.auth,
    deviceRole: input.deviceRole as FamilyDeviceRole, timezone: input.timezone
  };
}

export function normalizeEndpoint(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048) return null;
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === "https:" && !endpoint.username && !endpoint.password ? value : null;
  } catch { return null; }
}
