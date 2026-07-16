const CACHE_NAME = "runmate-cache-v1";

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ออฟไลน์ - RunMate AI</title>
  <style>
    body {
      background: #fbf7ef;
      color: #2f332f;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
      text-align: center;
    }
    .card {
      background: #fffdf8;
      border: 1px solid #e4d8c8;
      border-radius: 20px;
      padding: 35px 25px;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 18px 45px rgba(72, 82, 72, 0.07);
    }
    .icon {
      font-size: 48px;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 20px;
      margin: 0 0 10px 0;
      color: #17201d;
    }
    p {
      font-size: 14px;
      line-height: 1.6;
      color: #6f756d;
      margin: 0 0 25px 0;
    }
    .btn {
      display: inline-block;
      background: linear-gradient(180deg, #5f8f7a 0%, #4f8a78 100%);
      color: white;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 999px;
      font-weight: bold;
      font-size: 14px;
      border: none;
      cursor: pointer;
      box-shadow: 0 10px 24px rgba(79, 138, 120, 0.18);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📶</div>
    <h1>เชื่อมต่ออินเทอร์เน็ตไม่ได้</h1>
    <p>ตอนนี้ออฟไลน์อยู่ บางฟีเจอร์อย่าง Upload และ Coach ต้องใช้อินเทอร์เน็ต</p>
    <button class="btn" onclick="window.location.reload()">ลองใหม่อีกครั้ง</button>
  </div>
</body>
</html>`;

// Install event - caching basic shell
self.addEventListener("install", () => {
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

// Push event - show a notification for incoming Web Push messages
self.addEventListener("push", (event) => {
  let payload = { title: "RunMate AI", body: "" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/" },
    })
  );
});

// Notification click - focus an existing tab if one is open, otherwise open a new one
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
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

  const isNavigate = event.request.mode === "navigate" || 
    (event.request.headers.get("accept") && event.request.headers.get("accept").includes("text/html"));

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
          if (isNavigate) {
            return new Response(OFFLINE_HTML, {
              headers: { "Content-Type": "text/html; charset=utf-8" }
            });
          }
        });
      })
  );
});
