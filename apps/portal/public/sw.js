const STATIC_CACHE = "embe-static-v3";
const OFFLINE_PAGE = "/offline";
const OPTIONAL_PRECACHE = ["/icon-192.png", "/icon-512.png"];
const ACTIVITY_DEDUP_MS = 10_000;
const recentActivities = new Map();

function familyActivityKind(pathname) {
  if (pathname.startsWith("/api/notifications/") || pathname.startsWith("/api/auth/")) return null;
  if (pathname === "/api/meals" || /^\/api\/meals\/[^/]+(?:\/complete)?$/.test(pathname)) return "meal";
  if (/^\/api\/pregnancy\/(?:care|health|mental-health|symptoms)$/.test(pathname) || pathname === "/api/postpartum/health") return "health";
  if (pathname === "/api/pregnancy/records" || /^\/api\/pregnancy\/records\/[^/]+$/.test(pathname)) return "medical";
  if (pathname === "/api/journal") return "journal";
  if (pathname === "/api/memories" || /^\/api\/memories\/[^/]+$/.test(pathname) || /^\/api\/photo-uploads\/[^/]+\/complete$/.test(pathname)) return "memory";
  if (pathname === "/api/tasks" || /^\/api\/tasks\/[^/]+$/.test(pathname) || pathname.startsWith("/api/birth-prep")) return "task";
  if (pathname === "/api/inventory" || pathname === "/api/procurement") return "inventory";
  if (/^\/api\/(?:family\/(?:lifecycle|profile)|pregnancy\/profile)$/.test(pathname)) return "profile";
  if (/^\/api\/baby\/(?:care|development|medical)(?:\/[^/]+)?$/.test(pathname)) return "baby";
  return null;
}

async function reportFamilyActivity(pathname, kind) {
  const now = Date.now();
  if (now - (recentActivities.get(kind) || 0) < ACTIVITY_DEDUP_MS) return;
  recentActivities.set(kind, now);
  try {
    const subscription = await self.registration.pushManager.getSubscription();
    const response = await fetch("/api/notifications/activity", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId: crypto.randomUUID(),
        sourceEndpoint: subscription?.endpoint ?? null,
        pathname,
        method: "POST"
      })
    });
    if (!response.ok) throw new Error("activity notification unavailable");
  } catch {
    if (recentActivities.get(kind) === now) recentActivities.delete(kind);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then(async (cache) => {
    await cache.add(OFFLINE_PAGE);
    await Promise.all(
      OPTIONAL_PRECACHE.map((path) => cache.add(path).catch(() => undefined))
    );
  }));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method !== "GET") {
    const kind = familyActivityKind(url.pathname);
    if (!kind) return;
    const responsePromise = fetch(request);
    event.respondWith(responsePromise);
    event.waitUntil(responsePromise.then((response) => response.ok
      ? reportFamilyActivity(url.pathname, kind)
      : undefined).catch(() => undefined));
    return;
  }

  if (
    url.pathname.startsWith("/api/")
    || url.pathname.startsWith("/api/media/")
    || url.pathname.startsWith("/login")
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_PAGE)) ?? Response.error())
    );
    return;
  }

  const isPublicAsset = url.pathname.startsWith("/_next/static/")
    || url.pathname.startsWith("/illustrations/")
    || (url.pathname === "/_next/image" && /^\/(?:illustrations\/|(?:apple-)?icon)/.test(url.searchParams.get("url") || ""))
    || /^\/(?:apple-)?icon(?:-[0-9]+)?\.(?:png|svg)$/.test(url.pathname);
  if (!isPublicAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        void caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let message = {};
  try { message = event.data?.json() ?? {}; } catch { message = {}; }
  const title = typeof message.title === "string" ? message.title.slice(0, 80) : "EmBe nhắc nhẹ";
  const body = typeof message.body === "string" ? message.body.slice(0, 240) : "Nhà mình có một việc cần xem.";
  const url = typeof message.url === "string" && message.url.startsWith("/") && !message.url.startsWith("//") ? message.url : "/";
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body, icon: "/icon-192.png", badge: "/icon-192.png", tag: typeof message.tag === "string" ? message.tag.slice(0, 100) : "embe-reminder",
      data: { url }
    }),
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => Promise.all(
      windows.map((client) => client.postMessage({ type: "EMBE_FAMILY_ACTIVITY", title, url }))
    ))
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    for (const client of windows) {
      if ("focus" in client) { await client.navigate(url); return client.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
