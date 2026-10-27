/* Manikstu Seller — service worker.
 *
 * Keeps the app's own files (versioned scripts and styles, icons, product pictures, fonts) so it
 * opens fast and shows an offline page with no connection. It never stores pages, router data or
 * API answers: those carry the signed-in seller's orders and must always come fresh from the server.
 *
 * Bump VERSION when this file's caching rules change; old caches are removed on activation.
 */
const VERSION = 'v3';
const STATIC_CACHE = `manikstu-seller-static-${VERSION}`;
const RUNTIME_CACHE = `manikstu-seller-runtime-${VERSION}`;
const RUNTIME_MAX_ENTRIES = 250;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [
  OFFLINE_URL,
  '/seller.webmanifest',
  '/brand/manikstu-emblem.png',
  '/brand/manikstu-logo-glossy.png',
  '/icons/icon-192.png',
  '/icons/favicon-32.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith('manikstu-seller-') && k !== STATIC_CACHE && k !== RUNTIME_CACHE)
      .map(k => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') {
    await cache.put(request, res.clone());
    trim(RUNTIME_CACHE, RUNTIME_MAX_ENTRIES);
  }
  return res;
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then(res => {
      if (res.ok || res.type === 'opaque') return cache.put(request, res.clone()).then(() => res);
      return res;
    })
    .catch(() => hit);
  if (hit) {
    event.waitUntil(refresh.then(() => undefined));
    return hit;
  }
  return refresh;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Development (localhost): never serve anything from cache, so code and style
  // changes show immediately. The dev server's files are not content-hashed, so
  // caching them would keep serving a stale build. Production (a real domain) is
  // unaffected and keeps full offline caching.
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;

  // Pages: always from the network (they contain the seller's data). Offline → the offline page.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        return await fetch(request);
      } catch {
        const cached = await caches.match(OFFLINE_URL, { cacheName: STATIC_CACHE });
        return cached || new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    // Never cache API calls or router data: both carry the seller's orders.
    if (url.pathname.startsWith('/api/')) return;
    if (request.headers.get('RSC') || url.searchParams.has('_rsc')) return;
    // Build files have the content hash in their name: safe to keep.
    if (url.pathname.startsWith('/_next/static/')) { event.respondWith(cacheFirst(request)); return; }
    // Public pictures and icons: show the stored copy, refresh it in the background.
    if (/^\/(brand|icons|products|patterns)\//.test(url.pathname)) { event.respondWith(staleWhileRevalidate(event, request)); return; }
    if (PRECACHE.includes(url.pathname)) { event.respondWith(caches.match(request).then(hit => hit || fetch(request))); return; }
    return;
  }

  // Brand fonts.
  if (url.origin === 'https://fonts.googleapis.com') { event.respondWith(staleWhileRevalidate(event, request)); return; }
  if (url.origin === 'https://fonts.gstatic.com') { event.respondWith(cacheFirst(request)); return; }
});
