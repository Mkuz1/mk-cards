// MK Cards service worker. Bump VERSION on every release (keep in step with APP_VERSION in app.js):
// a changed file is what makes browsers show the "new version is ready" notice.
const VERSION = '2.5.0';
const CACHE = `mk-cards-${VERSION}`;
const SHELL = ['/', '/styles.css', '/app.js', '/card-art.js', '/vendor/qrcode.js', '/manifest.webmanifest', '/icons/favicon-32.png', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Pages: try the network so share previews and fresh shells win; fall back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/')) || Response.error()));
    return;
  }
  // Static files: answer from the versioned cache, otherwise fetch and remember.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
    return response;
  })());
});
