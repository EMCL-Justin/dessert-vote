// Dessert Vote service worker: lets the app open with no signal.
// Page: try the network briefly (so updates arrive), fall back to the cached copy.
// Everything else: serve from cache, refresh it in the background.
const CACHE = "dessert-vote-v2";
const CORE = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fetchAndStore(req) {
  return fetch(req).then((res) => {
    if (res && (res.ok || res.type === "opaque")) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    // Restaurant signal can be terrible: give the network 2.5s, then use the cache.
    e.respondWith(new Promise((resolve) => {
      let done = false;
      const fallback = () => caches.match("index.html").then((r) => r || caches.match("./"));
      const timer = setTimeout(() => { if (!done) { done = true; fallback().then(resolve); } }, 2500);
      fetchAndStore(req)
        .then((res) => { if (!done) { done = true; clearTimeout(timer); resolve(res); } })
        .catch(() => { if (!done) { done = true; clearTimeout(timer); fallback().then(resolve); } });
    }));
    return;
  }

  // Same-origin files and Google Fonts: cache first, update in the background.
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin ||
    url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!cacheable) return;
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetchAndStore(req).catch(() => hit);
      return hit || net;
    })
  );
});
