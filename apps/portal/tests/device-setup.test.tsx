import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import DeviceSetup from "../src/components/device-setup";

describe("per-phone family setup", () => {
  beforeEach(() => localStorage.clear());

  it("remembers whose iPhone this is without asking on every action", () => {
    render(<DeviceSetup />);
    fireEvent.click(screen.getByRole("button", { name: "Điện thoại của Mẹ Ngân" }));
    expect(localStorage.getItem("embe:device-role")).toBe("mother");
    expect(screen.getByRole("status")).toHaveTextContent("Mẹ Ngân");
  });

  it("offers one-tap notification setup on a family phone", () => {
    render(<DeviceSetup />);
    expect(screen.getByRole("button", { name: "Bật thông báo" })).toBeInTheDocument();
    expect(screen.getByText(/lịch khám, việc đến hạn và đồ dùng sắp hết/i)).toBeInTheDocument();
  });
});
