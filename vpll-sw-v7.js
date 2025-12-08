// --------------------------------------------------------------
//  CLEAN, SAFE, STABLE SERVICE WORKER (NO NOTIFICATIONS)
// --------------------------------------------------------------

const CACHE_NAME = "vpll-static-v7";

const STATIC_ASSETS = [
  "/", 
  "/index.html",
  "/style.css",
  "/app-v2.js",
  "/60thlogo.jpg",
  "/home_banner.jpg",
  "/favicon.ico"
];

// --------------------------------------------------------------
// INSTALL — Cache core static files
// --------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("Static cache failed:", err);
      });
    })
  );
  self.skipWaiting();
});

// --------------------------------------------------------------
// ACTIVATE — Remove old caches
// --------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// --------------------------------------------------------------
// FETCH — Cache-first for static assets only
//          Network-only for everything else (API, scripts, etc.)
// --------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. External requests (Google Sheets, Apps Script)
  if (url.hostname.includes("google")) {
    return; // Let browser handle it normally
  }

  // 2. Always network-fetch JS (gets you fresh updates every time)
  if (url.pathname.endsWith(".js")) {
    return; 
  }

  // 3. Cache-first for listed static assets
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return resp;
        });
      })
    );
    return;
  }

  // 4. Everything else → network only
  return;
});
