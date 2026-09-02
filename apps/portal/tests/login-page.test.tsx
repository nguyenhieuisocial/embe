import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LoginPage from "../src/app/login/page";

describe("family password page", () => {
  it("asks only for the shared family password", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ next: "/family" }) }));

    expect(screen.getByRole("heading", { name: "Mời cả nhà vào bên trong" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mật khẩu")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Vào sổ gia đình" })).toBeInTheDocument();
    expect(document.querySelector('form[action="/api/auth/login"]')).not.toBeNull();
    expect(document.querySelector('input[name="next"]')).toHaveValue("/family");
  });

  it("uses the same neutral copy for a failed or delayed login", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "1" }) }));

    expect(screen.getByRole("alert")).toHaveTextContent("Chưa vào được. Đợi một chút rồi thử lại.");
  });
});
