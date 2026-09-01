"use client";

import { useEffect } from "react";

import { DEVICE_SETTINGS_EVENT, readDeviceSettings } from "../lib/device-preferences";

export default function DevicePreferencesRuntime() {
  useEffect(() => {
    const root = document.documentElement;

    function apply() {
      const settings = readDeviceSettings(localStorage);
      root.dataset.embeDensity = settings.density;
      root.dataset.embeText = settings.textSize;
      root.dataset.embeMotion = settings.motion;
      root.dataset.embePrivate = settings.privacyShield ? "on" : "off";
      if (!settings.privacyShield) delete root.dataset.embeObscured;
    }

    function obscure() {
      if (root.dataset.embePrivate === "on") root.dataset.embeObscured = "on";
    }

    function reveal() {
      delete root.dataset.embeObscured;
    }

    function visibility() {
      if (document.visibilityState === "hidden") obscure(); else reveal();
    }

    apply();
    window.addEventListener(DEVICE_SETTINGS_EVENT, apply);
    window.addEventListener("storage", apply);
    window.addEventListener("blur", obscure);
    window.addEventListener("focus", reveal);
    window.addEventListener("pagehide", obscure);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener(DEVICE_SETTINGS_EVENT, apply);
      window.removeEventListener("storage", apply);
      window.removeEventListener("blur", obscure);
      window.removeEventListener("focus", reveal);
      window.removeEventListener("pagehide", obscure);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  return null;
}
