// sw.js — offline support for the Quiz web app.
// Paths are relative to the SW location, so they work under any subpath.
const CACHE = "quiz-v1";

// App shell: cached up front so the app boots with no network.
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./manifest.json",
  "./data.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Precache every collection file listed in the data manifest, so all
    // collections are available offline (not just ones opened while online).
    try {
      const manifest = await fetch("./data.json", { cache: "no-cache" }).then(r => r.json());
      const files = [...new Set(Object.values(manifest))];
      await Promise.all(files.map(f => cache.add(f).catch(() => {})));
    } catch (_) {
      // Manifest unreachable at install time — runtime caching will fill in.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Cache-first, then network. Successful network responses (CDN libs like
// KaTeX/PapaParse/lucide, plus any data file) are cached for next time offline.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (cached) return cached;
    try {
      const res = await fetch(e.request);
      if (res && (res.ok || res.type === "opaque")) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    } catch (_) {
      // Offline and not cached. For navigations, fall back to the app shell.
      if (e.request.mode === "navigate") {
        return (await caches.match("./index.html")) || Response.error();
      }
      return Response.error();
    }
  })());
});
