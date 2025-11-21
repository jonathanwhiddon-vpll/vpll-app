// --------------------------------------------------------------
//  NEW SERVICE WORKER — Chromebook-Safe, Minimal Caching
// --------------------------------------------------------------

// Version bump anytime you deploy (forces refresh everywhere)
const CACHE_VERSION = "vpll-cache-v5";
const STATIC_CACHE = `${CACHE_VERSION}-static`;

// Only cache STATIC assets — NEVER cache Google Sheets or app.js
const STATIC_ASSETS = [
  "/",               // root
  "/index.html",
  "/style.css",
  "/favicon.ico",
  "/logo192.png",
  "/logo512.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// --------------------------------------------------------------
//  INSTALL — Precache static files only
// --------------------------------------------------------------
self.addEventListener("install", (event) => {
  self.skipWaiting(); // take control immediately
// iOS fix: always re-download main index file
event.waitUntil(
    caches.delete(STATIC_CACHE)
);

  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("Static cache failed:", err);
      });
    })
  );
});

// --------------------------------------------------------------
//  ACTIVATE — Delete old caches
// --------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );

  self.clients.claim();
});

// --------------------------------------------------------------
//  FETCH — Network-first for EVERYTHING except static assets
// --------------------------------------------------------------
//
//  IMPORTANT:
//  - Google Sheets CSVs bypass service worker entirely
//  - app.js bypasses service worker entirely
//  - Only static assets fall back to cache
//
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept Google Sheets CSVs or Apps Script API
  if (url.hostname.includes("googleusercontent") ||
      url.hostname.includes("googleapis") ||
      url.hostname.includes("google.com")) {
    return;
  }

  // Never intercept your JS files (app.js, service-worker.js, etc.)
  if (url.pathname.endsWith(".js")) {
    return;
  }

  // Cache static assets — Network first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();

        if (STATIC_ASSETS.some((asset) => url.pathname === asset)) {
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(event.request, copy);
          });
        }

        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
