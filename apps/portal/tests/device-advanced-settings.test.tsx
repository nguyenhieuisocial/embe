import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import AdvancedDeviceSettings from "../src/components/advanced-device-settings";
import DevicePreferencesRuntime from "../src/components/device-preferences-runtime";
import { DEVICE_SETTINGS_KEY } from "../src/lib/device-preferences";

describe("advanced settings for each family phone", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-embe-density");
    document.documentElement.removeAttribute("data-embe-text");
    document.documentElement.removeAttribute("data-embe-motion");
    document.documentElement.removeAttribute("data-embe-private");
  });

  it("stores compact, readable and privacy choices on this phone", () => {
    render(<AdvancedDeviceSettings />);

    fireEvent.click(screen.getByRole("button", { name: "Gọn" }));
    fireEvent.click(screen.getByRole("button", { name: "Chữ lớn" }));
    fireEvent.click(screen.getByRole("switch", { name: "Giảm chuyển động" }));
    fireEvent.click(screen.getByRole("switch", { name: "Che nội dung khi rời EmBe" }));

    expect(JSON.parse(localStorage.getItem(DEVICE_SETTINGS_KEY) ?? "{}")).toEqual({
      density: "compact", textSize: "large", motion: "reduced", privacyShield: true
    });
    expect(screen.getByRole("status")).toHaveTextContent("Đã lưu trên điện thoại này");
  });

  it("applies saved choices to the whole web-app", () => {
    localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify({
      density: "compact", textSize: "large", motion: "reduced", privacyShield: true
    }));
    render(<DevicePreferencesRuntime />);

    expect(document.documentElement.dataset.embeDensity).toBe("compact");
    expect(document.documentElement.dataset.embeText).toBe("large");
    expect(document.documentElement.dataset.embeMotion).toBe("reduced");
    expect(document.documentElement.dataset.embePrivate).toBe("on");
  });
});
