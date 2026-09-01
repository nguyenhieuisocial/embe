const STATIC_CACHE = "embe-static-v1";
const OFFLINE_PAGE = "/offline";
const OPTIONAL_PRECACHE = ["/icon-192.png", "/icon-512.png"];

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
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

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
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: "/icon-192.png", badge: "/icon-192.png", tag: typeof message.tag === "string" ? message.tag.slice(0, 100) : "embe-reminder",
    data: { url }
  }));
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
