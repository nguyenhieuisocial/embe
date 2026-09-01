export type DeviceRole = "father" | "mother";
export type DisplayDensity = "comfortable" | "compact";
export type DeviceTextSize = "standard" | "large";
export type MotionPreference = "system" | "reduced";

export type DeviceSettings = {
  density: DisplayDensity;
  textSize: DeviceTextSize;
  motion: MotionPreference;
  privacyShield: boolean;
};

export const DEVICE_ROLE_KEY = "embe:device-role";
export const DEVICE_SETTINGS_KEY = "embe:device-settings";
export const DEVICE_SETTINGS_EVENT = "embe:device-settings-changed";
export const NOTIFY_AT_KEY = "embe:notify-at";

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  density: "comfortable",
  textSize: "standard",
  motion: "system",
  privacyShield: false
};

export function readDeviceRole(storage: Pick<Storage, "getItem">): DeviceRole | null {
  try {
    const value = storage.getItem(DEVICE_ROLE_KEY);
    return value === "father" || value === "mother" ? value : null;
  } catch { return null; }
}

export function saveDeviceRole(storage: Pick<Storage, "setItem">, role: DeviceRole): void {
  try {
    storage.setItem(DEVICE_ROLE_KEY, role);
    storage.setItem("embe-photo-author", role);
  } catch {
    // The current action still works when iOS private browsing blocks storage.
  }
}

export function readDeviceSettings(storage: Pick<Storage, "getItem">): DeviceSettings {
  try {
    const value = JSON.parse(storage.getItem(DEVICE_SETTINGS_KEY) ?? "null") as Partial<DeviceSettings> | null;
    return {
      density: value?.density === "compact" ? "compact" : "comfortable",
      textSize: value?.textSize === "large" ? "large" : "standard",
      motion: value?.motion === "reduced" ? "reduced" : "system",
      privacyShield: value?.privacyShield === true
    };
  } catch { return DEFAULT_DEVICE_SETTINGS; }
}

export function saveDeviceSettings(storage: Pick<Storage, "setItem">, settings: DeviceSettings): void {
  try {
    storage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify(settings));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(DEVICE_SETTINGS_EVENT));
  } catch {
    // The controls still work for this view when iOS private browsing blocks storage.
  }
}

export function readNotifyAt(storage: Pick<Storage, "getItem">): string {
  try {
    const value = storage.getItem(NOTIFY_AT_KEY);
    return value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "08:00";
  } catch { return "08:00"; }
}

export function saveNotifyAt(storage: Pick<Storage, "setItem">, notifyAt: string): void {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(notifyAt)) return;
  try { storage.setItem(NOTIFY_AT_KEY, notifyAt); } catch { /* Keep the selected value in component state. */ }
}
