/* Track Records PWA Service Worker
   Cache-bust version: v9
   (Increment v# any time you deploy changes)
*/
const CACHE_NAME = "track-records-cache-v9";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  event.respondWith((async () => {
    try {
      // Network first for JS/CSS/HTML so updates show up faster
      const req = event.request;
      const url = new URL(req.url);

      const isSameOrigin = url.origin === self.location.origin;
      const isCore =
        isSameOrigin &&
        (url.pathname.endsWith("/") ||
         url.pathname.endsWith("/index.html") ||
         url.pathname.endsWith("/app.js") ||
         url.pathname.endsWith("/styles.css") ||
         url.pathname.endsWith("/config.js") ||
         url.pathname.endsWith("/manifest.webmanifest"));

      if (isCore) {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      }

      // Otherwise cache-first
      const cached = await caches.match(req);
      if (cached) return cached;

      const res = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
      return res;

    } catch (e) {
      const cached = await caches.match(event.request);
      return cached || new Response("Offline", { status: 200 });
    }
  })());
});
