/* Track Records PWA Service Worker
   Cache version: v4
   Bump this any time you deploy changes.
*/
const CACHE_NAME = "track-records-cache-v4";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

// Install: cache core assets
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

// Activate: remove old caches
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))
    );
    await self.clients.claim();
  })());
});

// Fetch strategy:
// - Network-first for core files to get updates quickly
// - Cache-first for everything else for strong offline support
self.addEventListener("fetch", (event) => {
  event.respondWith((async () => {
    const req = event.request;

    try {
      const url = new URL(req.url);
      const sameOrigin = url.origin === self.location.origin;

      const isCore = sameOrigin && (
        url.pathname === "/" ||
        url.pathname.endsWith("/index.html") ||
        url.pathname.endsWith("/styles.css") ||
        url.pathname.endsWith("/app.js") ||
        url.pathname.endsWith("/config.js") ||
        url.pathname.endsWith("/manifest.webmanifest") ||
        url.pathname.endsWith("/service-worker.js")
      );

      if (isCore) {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      }

      const cached = await caches.match(req);
      if (cached) return cached;

      const res = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
      return res;

    } catch (e) {
      const cached = await caches.match(req);
      return cached || new Response("Offline", { status: 200 });
    }
  })());
});
