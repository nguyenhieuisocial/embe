"use client";

import { usePathname } from "next/navigation";

import FamilyNav from "./family-nav";
import DeviceAccessPrompt from "./device-access-prompt";
import QuickActions from "./quick-actions";

/** Trước khi đăng nhập và khi mất mạng, màn hình chỉ có một việc duy nhất. */
const BARE_ROUTES = new Set(["/login", "/offline"]);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNav = !BARE_ROUTES.has(pathname ?? "");

  return (
    <div className={showNav ? "app-shell has-nav" : "app-shell is-bare"}>
      <a className="skip-link" href="#main-content">Bỏ qua đến nội dung chính</a>
      <div className="app-canvas" id="main-content" tabIndex={-1}>{children}</div>
      {showNav ? <><DeviceAccessPrompt /><QuickActions /><FamilyNav /></> : null}
    </div>
  );
}
