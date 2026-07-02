/* =====================================================
   Service Worker — Точка Ру А1
   Strategy: Cache-first for static assets,
             Network-first (with cache fallback) for data.json
   ===================================================== */

const CACHE_NAME = 'tochkaru-v1';

/* Files to pre-cache on install */
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './data.json'
];

/* ---- Install: pre-cache shell ---- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        /* data.json may not exist yet — that's fine, cache what we can */
        return Promise.all(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(() => { /* skip missing files silently */ })
          )
        );
      });
    }).then(() => self.skipWaiting())
  );
});

/* ---- Activate: remove old caches ---- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* ---- Fetch ---- */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Only handle same-origin GET requests */
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  /* data.json → Network-first (always try to get fresh lessons) */
  if (url.pathname.endsWith('/data.json')) {
    event.respondWith(networkFirstThenCache(event.request));
    return;
  }

  /* Audio files → Network-first with cache fallback */
  if (url.pathname.match(/\.(mp3|ogg|wav|m4a)$/i)) {
    event.respondWith(networkFirstThenCache(event.request));
    return;
  }

  /* Everything else (HTML, JS, CSS, fonts, manifest) → Cache-first */
  event.respondWith(cacheFirstThenNetwork(event.request));
});

/* ---- Strategies ---- */

async function cacheFirstThenNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — resource not cached yet.', { status: 503 });
  }
}

async function networkFirstThenCache(request) {
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline — data not available.', { status: 503 });
  }
}
