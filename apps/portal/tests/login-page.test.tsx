import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LoginPage from "../src/app/login/page";

describe("family password page", () => {
  it("asks only for the shared family password", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ next: "/family" }) }));

    expect(screen.getByRole("heading", { name: "Không gian riêng của gia đình" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mật khẩu")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Mở nhật ký" })).toBeInTheDocument();
    expect(document.querySelector('form[action="/api/auth/login"]')).not.toBeNull();
    expect(document.querySelector('input[name="next"]')).toHaveValue("/family");
  });

  it("explains when the submitted password was incorrect", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "1" }) }));

    expect(screen.getByRole("alert")).toHaveTextContent("Mật khẩu chưa đúng");
  });
});
