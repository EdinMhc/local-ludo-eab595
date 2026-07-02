/* Local-Ludo service worker — installability + fast static assets.
   Bump CACHE_VERSION on any change to force clients onto the new worker. */
const CACHE_VERSION = "local-ludo-v1";

self.addEventListener("install", (event) => {
  // Activate the new worker immediately.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept the realtime socket connection.
  if (url.pathname.startsWith("/socket.io")) return;

  // App shell / pages: network-first so users always get the latest build.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/").then((r) => r || Response.error()))
    );
    return;
  }

  // Content-hashed build assets only: cache-first (filenames change per build,
  // so they can never go stale). Everything else (icons, manifest, etc.) falls
  // through to the network so a redeploy is always picked up.
  if (url.pathname.startsWith("/_next/static")) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
    );
  }
});
