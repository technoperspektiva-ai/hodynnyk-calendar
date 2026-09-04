const VERSION = '0.2.1';
const STATIC_CACHE = `hodynnyk-static-${VERSION}`;
const RUNTIME_CACHE = `hodynnyk-runtime-${VERSION}`;

const PRECACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/pwa.js',
  '/manifest.webmanifest',
  '/assets/hodynnyk-scene.webp',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('hodynnyk-') && ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // Only the main PWA shell is cached. Private/unknown routes are network-only.
    if (url.pathname !== '/' && url.pathname !== '/index.html') {
      event.respondWith(fetch(request));
      return;
    }
    event.respondWith((async () => {
      try {
        const network = await fetch(request);
        const cacheControl = network.headers.get('cache-control') || '';
        if (network.ok && !cacheControl.includes('no-store')) {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(request, network.clone());
        }
        return network;
      } catch {
        return (await caches.match(request)) || (await caches.match('/')) || (await caches.match('/index.html'));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const networkPromise = fetch(request)
      .then(async response => {
        if (response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })
      .catch(() => null);

    return cached || (await networkPromise) || new Response('', { status: 504 });
  })());
});
