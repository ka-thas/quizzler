// sw.js — offline support for the Quiz web app.
// Paths are relative to the SW location, so they work under any subpath.
const CACHE = "quiz-v2";

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
      // Fetch each collection: cache it, and collect its question images so the
      // whole quiz (including media) is available offline.
      const collections = await Promise.all(files.map(async f => {
        try {
          const res = await fetch(f, { cache: "no-cache" });
          if (res.ok) await cache.put(f, res.clone());
          return await res.json();
        } catch (_) { return null; }
      }));
      const images = [...new Set(collections.flatMap(c =>
        (c?.questions || []).flatMap(q => {
          const m = q && q.img;
          return Array.isArray(m) ? m : m ? [m] : [];
        })
      ))];
      await Promise.all(images.map(src => cache.add(src).catch(() => {})));
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

// Quiz data (the manifest and per-theme files) is synced from Notion, so it
// must update when online. Match data.json and anything under /data/.
const isData = (url) => /\/data\.json$|\/data\//.test(new URL(url).pathname);

// Network-first for data: fetch fresh, fall back to cache when offline.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  if (isData(e.request.url)) {
    e.respondWith((async () => {
      try {
        const res = await fetch(e.request, { cache: "no-cache" });
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      } catch (_) {
        return (await caches.match(e.request)) || Response.error();
      }
    })());
    return;
  }

  // Cache-first for the app shell and CDN libs (KaTeX, lucide). Successful
  // network responses are cached for next time offline.
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
