// === VPLL SERVICE WORKER (No aggressive caching) ===
// Forces the app to ALWAYS use the newest files.
// Automatically updates when new deployments happen.

const CACHE_NAME = "vpll-cache-v" + Date.now();

// List only essential static assets
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/vpll-logo.png"
];

// Install – cache the core assets
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

// Activate – delete ALL old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => {
        if (k !== CACHE_NAME) return caches.delete(k);
      }))
    )
  );
  self.clients.claim();
});

// Fetch – ALWAYS get newest file from the network first.
// Fall back to cache ONLY if offline.
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, copy);
        });
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
// ==== PUSH NOTIFICATIONS (Add This At The Bottom) ====

// Receive push from server
self.addEventListener("push", function (event) {
  console.log("Push received:", event.data ? event.data.text() : "");

  let payload = {};

  try {
    payload = event.data.json();
  } catch (err) {
    payload = { title: "VPLL", body: event.data.text() };
  }

  const title = payload.title || "Villa Park Little League";
  const options = {
    body: payload.body || "",
    icon: "/60thlogo.jpg",
    badge: "/60thlogo.jpg",
    vibrate: [100, 50, 100],
    data: payload, // for click handling
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification clicks
self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const urlToOpen = event.notification.data.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});


