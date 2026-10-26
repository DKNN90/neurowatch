/* NeuroWatch service worker: app shell cached; feed.json network-first with offline fallback. */
const VERSION = "nw-v2";
const SHELL = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  if (url.pathname.endsWith("/feed.json")) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put("feed.json", copy)); }
          return res;
        })
        .catch(() => caches.open(VERSION).then((c) => c.match("feed.json")).then((cached) => {
          if (!cached) return new Response("{}", { status: 503 });
          return cached.text().then((body) => new Response(body, { headers: { "Content-Type": "application/json", "x-nw-cache": "1" } }));
        }))
    );
    return;
  }

  // App shell: cache first, refresh in background.
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => {
      const net = fetch(e.request).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      }).catch(() => cached || caches.match("index.html"));
      return cached || net;
    })
  );
});
