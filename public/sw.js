const CACHE_NAME = "runmate-cache-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/favicon.ico",
  "/icon-192x192.png",
  "/icon-512x512.png",
];

// Install event - caching basic shell
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// Activate event - cleanup old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Network-first strategy to prevent stale caches during development
self.addEventListener("fetch", (event) => {
  // Only handle GET requests and local scope
  if (
    event.request.method !== "GET" ||
    !event.request.url.startsWith(self.location.origin) ||
    event.request.url.includes("/api/") || // Don't cache API requests
    event.request.url.includes("/_next/")  // Don't cache Next.js system files to avoid build mismatch
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache new successful GET responses
        if (response && response.status === 200 && response.type === "basic") {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network is down
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
        });
      })
  );
});
