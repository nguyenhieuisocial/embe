"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { observeMobileDock } from "../lib/mobile-dock-position";

import FamilyNav from "./family-nav";
import DeviceAccessPrompt from "./device-access-prompt";
import QuickActions from "./quick-actions";
import PullToRefresh from './pull-to-refresh';

/** Trước khi đăng nhập và khi mất mạng, màn hình chỉ có một việc duy nhất. */
const BARE_ROUTES = new Set(["/login", "/offline"]);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNav = !BARE_ROUTES.has(pathname ?? "") && !pathname?.startsWith("/in-anh/") && !pathname?.startsWith("/chia-se/");
  const isStudio = pathname === "/studio" || pathname?.startsWith("/studio/");
  const area = isStudio ? "studio"
    : pathname?.startsWith("/ky-niem") || pathname?.startsWith("/nhat-ky") ? "memories"
      : pathname?.startsWith("/me-bau/bua-an") ? "nutrition"
        : pathname?.startsWith("/me-bau") || pathname === "/me" || pathname?.startsWith("/be") ? "care" : "family";
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showNav && shell.current) return observeMobileDock(shell.current);
  }, [showNav, pathname]);

  return (
    <div ref={shell} data-area={area} className={showNav ? `app-shell has-nav${isStudio ? " is-studio" : ""}` : "app-shell is-bare"}>
      <a className="skip-link" href="#main-content">Bỏ qua đến nội dung chính</a>
      <div className="app-canvas" id="main-content" tabIndex={-1}>{children}</div>
      {showNav ? <PullToRefresh key={pathname} /> : null}
      {showNav ? <>{!isStudio && <><DeviceAccessPrompt /><QuickActions key={pathname} /></>}<FamilyNav /></> : null}
    </div>
  );
}
