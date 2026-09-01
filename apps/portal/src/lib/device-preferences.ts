export type DeviceRole = "father" | "mother";

export const DEVICE_ROLE_KEY = "embe:device-role";

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
