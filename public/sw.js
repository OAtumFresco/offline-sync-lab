const CACHE = 'offline-sync-lab-shell-v2';
const FILES = ['/', '/style.css', '/app.js', '/outbox.js', '/sync.js'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('offline-sync-lab-shell-') && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !FILES.includes(url.pathname)) return;
  // API responses are never cached: an offline page cannot manufacture an acknowledgement.
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) ?? fetch(event.request)));
});
