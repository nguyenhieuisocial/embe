import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type StoredPasskey = {
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[];
  label?: string;
  created_at?: string;
  last_used_at?: string | null;
  backed_up?: boolean;
};

export function passkeyStore(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

export function passkeyList(value: unknown): StoredPasskey[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StoredPasskey => {
    if (!item || typeof item !== "object") return false;
    const row = item as Partial<StoredPasskey>;
    return typeof row.credential_id === "string" && Array.isArray(row.transports);
  });
}

export function onePasskey(value: unknown): StoredPasskey | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const item = row as Partial<StoredPasskey>;
  if (
    typeof item.credential_id !== "string" ||
    typeof item.public_key !== "string" ||
    !Number.isSafeInteger(item.counter) ||
    !Array.isArray(item.transports)
  ) return null;
  return item as StoredPasskey;
}

