// --------------------------------------------------------------
//  CLEAN, iOS-SAFE SERVICE WORKER
// --------------------------------------------------------------

const CACHE_VERSION = "vpll-cache-v7";
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/style.css?v=4",
  "/favicon.ico",
  "/60thlogo.jpg",
  "/home_banner.jpg",
];

// --------------------------------------------------------------
// INSTALL — wipe previous caches & add fresh assets
// --------------------------------------------------------------
self.addEventListener("install", (event) => {
  self.skipWaiting();

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
// ACTIVATE — remove all old cache versions
// --------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// --------------------------------------------------------------
// FETCH — Network-first. Cache only STATIC files.
// --------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache JS (always get newest app.js)
  if (url.pathname.endsWith(".js")) {
    return fetch(event.request);
  }

  // Never cache Google Sheets or Apps Script
  if (url.hostname.includes("google")) {
    return fetch(event.request);
  }

  // Static assets with fallback
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(event.request, copy);
          });
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else: network first
  event.respondWith(fetch(event.request));
});

